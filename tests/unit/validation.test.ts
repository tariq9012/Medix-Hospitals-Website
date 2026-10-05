import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createReviewSchema,
  doctorSearchSchema,
  hospitalSearchSchema,
  moderationHideSchema,
  reviewInputSchema,
  setDoctorFavoriteSchema,
} from "../../src/lib/validation/directory";

const UUID = "3f2a9c1e-7b4d-4e8a-9d21-5c6b7a8e9f01";

describe("directory search validation (lenient; never throws, never reaches SQL unconstrained)", () => {
  it("falls back to safe defaults for hostile or malformed input", () => {
    const p = doctorSearchSchema.parse({
      q: "x".repeat(500),
      specialty: "A B; DROP TABLE users",
      minFee: "abc",
      minRating: "99",
      mode: "BOGUS",
      sort: "fee_asc; DROP TABLE users;--",
      page: "-3",
      pageSize: "99999",
    });
    assert.equal(p.q!.length, 80);
    assert.equal(p.specialty, undefined);
    assert.equal(p.minFee, undefined);
    assert.equal(p.minRating, undefined);
    assert.equal(p.mode, undefined);
    assert.equal(p.sort, "recommended");
    assert.equal(p.page, 1);
    assert.equal(p.pageSize, 12);
  });

  it("accepts every whitelisted sort and valid filters", () => {
    for (const sort of ["recommended", "rating", "reviews", "fee_asc", "fee_desc", "experience"]) {
      assert.equal(doctorSearchSchema.parse({ sort }).sort, sort);
    }
    const p = doctorSearchSchema.parse({
      specialty: "cardiology",
      minRating: "4",
      mode: "ONLINE",
      scheduled: "1",
      page: "3",
    });
    assert.deepEqual(
      [p.specialty, p.minRating, p.mode, p.scheduled, p.page],
      ["cardiology", 4, "ONLINE", "1", 3],
    );
  });

  it("hospital search has its own whitelist", () => {
    assert.equal(hospitalSearchSchema.parse({ sort: "doctors" }).sort, "doctors");
    assert.equal(hospitalSearchSchema.parse({ sort: "fee_asc" }).sort, "recommended");
  });
});

describe("review input validation", () => {
  const ok = (v: unknown) => reviewInputSchema.safeParse(v).success;

  it("accepts integer ratings 1–5 with an optional plain-text comment", () => {
    assert.ok(ok({ rating: 5 }));
    assert.ok(ok({ rating: "3", comment: "  Clear explanation and friendly staff.  " }));
    assert.ok(ok({ rating: 4, comment: "Wait was > 1 hour but < 2 hours, otherwise fine." }));
  });

  it("rejects bad ratings, short/oversized comments, HTML and control characters", () => {
    for (const rating of [0, 6, -1, 2.5, "abc", null, undefined])
      assert.equal(ok({ rating }), false, String(rating));
    assert.equal(ok({ rating: 3, comment: "short" }), false);
    assert.equal(ok({ rating: 3, comment: "x".repeat(1501) }), false);
    assert.equal(ok({ rating: 3, comment: "<script>alert(1)</script> padded out" }), false);
    assert.equal(ok({ rating: 3, comment: "<img src=x onerror=alert(1)> long enough" }), false);
    assert.equal(ok({ rating: 3, comment: "hello\u0000world long enough text" }), false);
    assert.equal(ok({ rating: 3, comment: "!!!!!!!!!!!!!!!!" }), false);
  });

  it("the create schema never carries patient/doctor/hospital ids from the browser", () => {
    const parsed = createReviewSchema.parse({
      appointmentId: UUID,
      rating: 4,
      comment: "Good visit overall.",
      patientId: UUID,
      doctorId: UUID,
      hospitalId: UUID,
    });
    assert.deepEqual(Object.keys(parsed).sort(), ["appointmentId", "comment", "rating"]);
  });

  it("moderation requires a real reason; favorites schema has no patientId", () => {
    assert.equal(moderationHideSchema.safeParse({ reviewId: UUID, reason: "no" }).success, false);
    assert.equal(
      moderationHideSchema.safeParse({ reviewId: UUID, reason: "Abusive language policy" }).success,
      true,
    );
    const fav = setDoctorFavoriteSchema.parse({ doctorId: UUID, favorite: true, patientId: UUID });
    assert.deepEqual(Object.keys(fav).sort(), ["doctorId", "favorite"]);
  });
});
