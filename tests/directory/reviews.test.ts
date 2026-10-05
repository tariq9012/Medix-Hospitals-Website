import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { and, eq } from "drizzle-orm";

import { db } from "../../src/db";
import { auditLogs, notifications, reviews } from "../../src/db/schema";
import { searchPublicDoctors } from "../../src/lib/directory/doctors.server";
import { searchPublicHospitals } from "../../src/lib/directory/hospitals.server";
import { ReviewError } from "../../src/lib/reviews/errors";
import {
  getAppointmentReviewState,
  listAdminReviews,
  listPublicReviews,
} from "../../src/lib/reviews/queries.server";
import {
  adminHideReview,
  adminRestoreReview,
  createReview,
  removeOwnReview,
  restoreOwnReview,
  updateOwnReview,
} from "../../src/lib/reviews/service.server";
import { doctorSearchSchema, hospitalSearchSchema } from "../../src/lib/validation/directory";

import { RUN, closeDb, mkAppointment, mkDoctor, mkHospital, mkPatient, mkUser } from "./fixtures";

after(closeDb);

/** Drizzle wraps Postgres errors ("Failed query…"); the constraint name lives in `cause`. */
const dbRejects = (p: Promise<unknown>, re: RegExp) =>
  assert.rejects(p, (e: unknown) => {
    const err = e as { message?: string; cause?: { message?: string } };
    return re.test(`${err.message ?? ""} ${err.cause?.message ?? ""}`);
  });

const rejects = (p: Promise<unknown>, code: string) =>
  assert.rejects(p, (e: unknown) => e instanceof ReviewError && e.code === code);

describe("review creation eligibility (spec §50 #1–#8)", () => {
  let hospital: Awaited<ReturnType<typeof mkHospital>>;
  let doctor: Awaited<ReturnType<typeof mkDoctor>>;
  let otherDoctor: Awaited<ReturnType<typeof mkDoctor>>;
  let patientA: Awaited<ReturnType<typeof mkPatient>>;
  let patientB: Awaited<ReturnType<typeof mkPatient>>;

  before(async () => {
    hospital = await mkHospital();
    doctor = await mkDoctor({ token: `Rv${RUN}`, hospitalId: hospital.id });
    otherDoctor = await mkDoctor({ token: `RvO${RUN}`, hospitalId: hospital.id });
    patientA = await mkPatient("Tariq", "Khan");
    patientB = await mkPatient("Bela", "Other");
  });

  const appt = (
    status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW",
    p = patientA,
  ) =>
    mkAppointment({ patientId: p.id, doctorId: doctor.doctor.id, hospitalId: hospital.id, status });

  it("#1 owner of a COMPLETED appointment can review; provider ids are derived from the appointment", async () => {
    const a = await appt("COMPLETED");
    const r = await createReview(patientA.id, {
      appointmentId: a.id,
      rating: 5,
      comment: "Excellent care, thank you.",
    });
    assert.equal(r.patientId, patientA.id);
    assert.equal(r.doctorId, doctor.doctor.id);
    assert.equal(r.hospitalId, hospital.id);
    assert.equal(r.appointmentId, a.id);
    assert.equal(r.moderationStatus, "PUBLISHED");
  });

  it("#2 PENDING and CONFIRMED appointments cannot be reviewed", async () => {
    await rejects(
      createReview(patientA.id, { appointmentId: (await appt("PENDING")).id, rating: 4 }),
      "NOT_COMPLETED",
    );
    await rejects(
      createReview(patientA.id, { appointmentId: (await appt("CONFIRMED")).id, rating: 4 }),
      "NOT_COMPLETED",
    );
  });

  it("#3 CANCELLED and NO_SHOW appointments cannot be reviewed", async () => {
    await rejects(
      createReview(patientA.id, { appointmentId: (await appt("CANCELLED")).id, rating: 4 }),
      "NOT_COMPLETED",
    );
    await rejects(
      createReview(patientA.id, { appointmentId: (await appt("NO_SHOW")).id, rating: 4 }),
      "NOT_COMPLETED",
    );
  });

  it("#4 Patient B cannot review Patient A's appointment (indistinguishable from not-found)", async () => {
    const a = await appt("COMPLETED");
    await rejects(
      createReview(patientB.id, {
        appointmentId: a.id,
        rating: 1,
        comment: "Malicious review attempt",
      }),
      "NOT_FOUND",
    );
    const rows = await db.select().from(reviews).where(eq(reviews.appointmentId, a.id));
    assert.equal(rows.length, 0);
    assert.equal(
      await getAppointmentReviewState(patientB.id, a.id),
      null,
      "B can't even see A's review state",
    );
  });

  it("#5 provider ids cannot be spoofed: extra doctorId/hospitalId/patientId in the payload are ignored", async () => {
    const a = await appt("COMPLETED");
    const spoofed = {
      appointmentId: a.id,
      rating: 4,
      comment: "Spoof attempt with extra ids",
      doctorId: otherDoctor.doctor.id,
      hospitalId: null,
      patientId: patientB.id,
    };
    const r = await createReview(patientA.id, spoofed as never);
    assert.equal(r.doctorId, doctor.doctor.id);
    assert.equal(r.hospitalId, hospital.id);
    assert.equal(r.patientId, patientA.id);
    // And at the server-function boundary, the schema simply has no such fields:
    const { createReviewSchema } = await import("../../src/lib/validation/directory");
    assert.deepEqual(Object.keys(createReviewSchema.parse(spoofed)).sort(), [
      "appointmentId",
      "comment",
      "rating",
    ]);
  });

  it("#6 one review per appointment (service + DB unique constraint, including concurrent submits)", async () => {
    const a = await appt("COMPLETED");
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        createReview(patientA.id, { appointmentId: a.id, rating: 5 }),
      ),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    for (const r of results.filter((x) => x.status === "rejected")) {
      const e = (r as PromiseRejectedResult).reason as ReviewError;
      assert.equal(e.code, "ALREADY_REVIEWED");
    }
    assert.equal(
      (await db.select().from(reviews).where(eq(reviews.appointmentId, a.id))).length,
      1,
    );
    // Raw DB-level proof (bypassing the service):
    await dbRejects(
      db.insert(reviews).values({
        patientId: patientA.id,
        doctorId: doctor.doctor.id,
        appointmentId: a.id,
        rating: 3,
      }),
      /reviews_appointment_unique|duplicate key/,
    );
  });

  it("#7 ratings outside 1–5 (or non-integer) are rejected by the service and by the DB CHECK", async () => {
    const a = await appt("COMPLETED");
    for (const rating of [0, 6, -1, 2.5, "abc", null, undefined]) {
      await rejects(createReview(patientA.id, { appointmentId: a.id, rating }), "INVALID_INPUT");
    }
    await dbRejects(
      db.insert(reviews).values({ patientId: patientA.id, doctorId: doctor.doctor.id, rating: 9 }),
      /reviews_rating_range|check constraint/,
    );
    assert.equal(
      (await db.select().from(reviews).where(eq(reviews.appointmentId, a.id))).length,
      0,
    );
  });

  it("#8 oversized, too-short, HTML-like and control-character comments are rejected (service + DB length CHECK)", async () => {
    const a = await appt("COMPLETED");
    const bad = [
      "x".repeat(1501),
      "short",
      "<script>alert(1)</script> bad bad bad",
      "<img src=x onerror=alert(1)> looks fine",
      "hello\u0000world this is long enough",
      "!!!!!!!!!!!!!!!!",
    ];
    for (const comment of bad) {
      await rejects(
        createReview(patientA.id, { appointmentId: a.id, rating: 3, comment }),
        "INVALID_INPUT",
      );
    }
    await dbRejects(
      db.insert(reviews).values({
        patientId: patientA.id,
        doctorId: doctor.doctor.id,
        rating: 3,
        reviewText: "y".repeat(2001),
      }),
      /reviews_text_length|check constraint/,
    );
    // Plain text with angle brackets used as math/emoticons (not tags) is allowed and stored verbatim.
    const ok = await createReview(patientA.id, {
      appointmentId: a.id,
      rating: 3,
      comment: "Wait time was > 1 hour but < 2 hours",
    });
    assert.equal(ok.reviewText, "Wait time was > 1 hour but < 2 hours");
  });

  it("review creation writes a transactional audit row with NO review text, and a generic doctor notification", async () => {
    const a = await appt("COMPLETED");
    const secret = "SECRET-REVIEW-TEXT-should-not-be-audited";
    const r = await createReview(patientA.id, { appointmentId: a.id, rating: 4, comment: secret });
    const logs = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, r.id), eq(auditLogs.action, "REVIEW_CREATED")));
    assert.equal(logs.length, 1);
    assert.ok(!JSON.stringify(logs[0]).includes(secret));
    assert.equal(logs[0]!.actorUserId, patientA.id);
    const notes = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, doctor.user.id));
    const note = notes.find(
      (n) => (n.metadata as { kind?: string } | null)?.kind === "REVIEW_RECEIVED",
    );
    assert.ok(note, "doctor notified");
    assert.ok(
      !note!.message.includes(secret) && !note!.message.includes("Tariq"),
      "notification is generic",
    );
  });
});

describe("review ownership & edit policy (spec §50 #9–#11)", () => {
  let hospital: Awaited<ReturnType<typeof mkHospital>>;
  let doc: Awaited<ReturnType<typeof mkDoctor>>;
  let patientA: Awaited<ReturnType<typeof mkPatient>>;
  let patientB: Awaited<ReturnType<typeof mkPatient>>;
  let hospitalAdmin: Awaited<ReturnType<typeof mkUser>>;
  let reviewId: string;

  before(async () => {
    hospital = await mkHospital();
    doc = await mkDoctor({ token: `Ow${RUN}`, hospitalId: hospital.id });
    patientA = await mkPatient("Aisha", "Rahman");
    patientB = await mkPatient();
    hospitalAdmin = await mkUser("HOSPITAL_ADMIN", "hadmin");
    const a = await mkAppointment({
      patientId: patientA.id,
      doctorId: doc.doctor.id,
      hospitalId: hospital.id,
      status: "COMPLETED",
    });
    reviewId = (
      await createReview(patientA.id, {
        appointmentId: a.id,
        rating: 3,
        comment: "Original comment text.",
      })
    ).id;
  });

  it("#9 the author can edit; editedAt is set and the aggregate follows", async () => {
    const updated = await updateOwnReview(patientA.id, {
      reviewId,
      rating: 5,
      comment: "Updated comment text.",
    });
    assert.equal(updated.rating, 5);
    assert.equal(updated.reviewText, "Updated comment text.");
    assert.ok(updated.editedAt);
    const list = await searchPublicDoctors(doctorSearchSchema.parse({ q: `Ow${RUN}` }), null);
    assert.equal(list.items[0]!.rating, 5);
    const audit = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, reviewId), eq(auditLogs.action, "REVIEW_UPDATED")));
    assert.equal(audit.length, 1);
  });

  it("#9 another patient cannot edit, remove or restore it", async () => {
    await rejects(
      updateOwnReview(patientB.id, { reviewId, rating: 1, comment: "Hijacked by someone else." }),
      "NOT_FOUND",
    );
    await rejects(removeOwnReview(patientB.id, reviewId), "NOT_FOUND");
    await rejects(restoreOwnReview(patientB.id, reviewId), "NOT_FOUND");
    const [row] = await db.select().from(reviews).where(eq(reviews.id, reviewId));
    assert.equal(row!.rating, 5);
  });

  it("#10/#11 the doctor and a hospital admin have no edit path: their identities match no review as author", async () => {
    for (const actor of [doc.user, hospitalAdmin]) {
      await rejects(
        updateOwnReview(actor.id, { reviewId, rating: 1, comment: "Provider rewriting review" }),
        "NOT_FOUND",
      );
      await rejects(removeOwnReview(actor.id, reviewId), "NOT_FOUND");
    }
    const [row] = await db.select().from(reviews).where(eq(reviews.id, reviewId));
    assert.equal(row!.reviewText, "Updated comment text.");
    assert.equal(row!.moderationStatus, "PUBLISHED");
  });

  it("patient removal hides (never deletes), drops out of aggregates, and can be restored by the patient", async () => {
    await removeOwnReview(patientA.id, reviewId);
    await removeOwnReview(patientA.id, reviewId); // idempotent
    const [row] = await db.select().from(reviews).where(eq(reviews.id, reviewId));
    assert.equal(row!.moderationStatus, "HIDDEN");
    assert.equal(row!.hiddenByUserId, patientA.id);
    assert.equal(row!.reviewText, "Updated comment text.", "content preserved");
    assert.equal(
      (await searchPublicDoctors(doctorSearchSchema.parse({ q: `Ow${RUN}` }), null)).items[0]!
        .reviewCount,
      0,
    );
    await rejects(
      updateOwnReview(patientA.id, { reviewId, rating: 2, comment: "Editing a removed review" }),
      "NOT_EDITABLE",
    );
    await restoreOwnReview(patientA.id, reviewId);
    assert.equal(
      (await searchPublicDoctors(doctorSearchSchema.parse({ q: `Ow${RUN}` }), null)).items[0]!
        .reviewCount,
      1,
    );
  });
});

describe("admin moderation (spec §50 #12)", () => {
  it("hide requires a reason, preserves the row + text, is audited, excluded from aggregates and public lists, and is reversible only for moderator-hidden reviews", async () => {
    const hospital = await mkHospital();
    const doc = await mkDoctor({ token: `Md${RUN}`, hospitalId: hospital.id });
    const patient = await mkPatient("Zoya", "Ali");
    const admin = await mkUser("ADMIN", "admin");
    const a = await mkAppointment({
      patientId: patient.id,
      doctorId: doc.doctor.id,
      hospitalId: hospital.id,
      status: "COMPLETED",
    });
    const review = await createReview(patient.id, {
      appointmentId: a.id,
      rating: 1,
      comment: "Abusive text that violates policy.",
    });
    const rating = async () =>
      (await searchPublicDoctors(doctorSearchSchema.parse({ q: `Md${RUN}` }), null)).items[0]!;
    const hospRating = async () =>
      (await searchPublicHospitals(hospitalSearchSchema.parse({ q: hospital.name }), null))
        .items[0]!;

    assert.equal((await rating()).reviewCount, 1);
    assert.equal((await hospRating()).reviewCount, 1);

    await rejects(
      adminHideReview(admin.id, { reviewId: review.id, reason: "no" }),
      "INVALID_INPUT",
    );
    await adminHideReview(admin.id, {
      reviewId: review.id,
      reason: "Violates abusive-language policy",
    });
    await rejects(
      adminHideReview(admin.id, {
        reviewId: review.id,
        reason: "Violates abusive-language policy",
      }),
      "ALREADY_HIDDEN",
    );

    const [row] = await db.select().from(reviews).where(eq(reviews.id, review.id));
    assert.equal(row!.moderationStatus, "HIDDEN");
    assert.equal(row!.reviewText, "Abusive text that violates policy.", "original text preserved");
    assert.equal(row!.rating, 1);
    assert.equal(row!.hiddenByUserId, admin.id);
    assert.equal(row!.hiddenReason, "Violates abusive-language policy");
    assert.ok(row!.hiddenAt);

    const audit = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityId, review.id), eq(auditLogs.action, "REVIEW_HIDDEN")));
    assert.equal(audit.length, 1);
    assert.equal(audit[0]!.actorUserId, admin.id);
    assert.ok(!JSON.stringify(audit[0]!.metadata).includes("Abusive text"));

    assert.equal((await rating()).reviewCount, 0, "removed from doctor aggregate");
    assert.equal((await hospRating()).reviewCount, 0, "removed from hospital aggregate");
    const pub = await listPublicReviews({ target: "doctor", targetId: doc.doctor.id, page: 1 });
    assert.equal(pub.total, 0);

    // Patient cannot un-hide or edit a moderator-hidden review.
    await rejects(restoreOwnReview(patient.id, review.id), "FORBIDDEN_ACTION");
    await rejects(
      updateOwnReview(patient.id, {
        reviewId: review.id,
        rating: 5,
        comment: "Edit after moderation.",
      }),
      "NOT_EDITABLE",
    );

    const adminView = await listAdminReviews({ status: "HIDDEN", page: 1 });
    assert.ok(adminView.items.some((i) => i.id === review.id && i.hiddenBy === "ADMIN"));

    await adminRestoreReview(admin.id, review.id);
    assert.equal((await rating()).reviewCount, 1, "restored into aggregate");
  });

  it("an admin cannot restore a review the PATIENT removed", async () => {
    const doc = await mkDoctor({ token: `Mp${RUN}` });
    const patient = await mkPatient();
    const admin = await mkUser("ADMIN", "admin");
    const a = await mkAppointment({
      patientId: patient.id,
      doctorId: doc.doctor.id,
      hospitalId: null,
      status: "COMPLETED",
    });
    const r = await createReview(patient.id, { appointmentId: a.id, rating: 4 });
    await removeOwnReview(patient.id, r.id);
    await rejects(adminRestoreReview(admin.id, r.id), "FORBIDDEN_ACTION");
  });
});

describe("public review display", () => {
  it("shows privacy-conscious names, plain text, edited flag, server-side pagination and no unlimited loads", async () => {
    const doc = await mkDoctor({ token: `Pd${RUN}` });
    const names: [string, string][] = [
      ["Tariq", "Khan"],
      ["Mona", "Zafar"],
      ["Ali", "Raza"],
      ["Nida", "Hasan"],
      ["Omar", "Sheikh"],
      ["Hira", "Baig"],
      ["Sami", "Dar"],
    ];
    for (const [f, l] of names) {
      const p = await mkPatient(f, l);
      const a = await mkAppointment({
        patientId: p.id,
        doctorId: doc.doctor.id,
        hospitalId: null,
        status: "COMPLETED",
      });
      await createReview(p.id, {
        appointmentId: a.id,
        rating: 4,
        comment: "Helpful and kind <3 doctor, truly.",
      });
    }
    const p1 = await listPublicReviews({ target: "doctor", targetId: doc.doctor.id, page: 1 });
    const p2 = await listPublicReviews({ target: "doctor", targetId: doc.doctor.id, page: 2 });
    assert.deepEqual(
      [p1.total, p1.pageSize, p1.totalPages, p1.items.length, p2.items.length],
      [7, 5, 2, 5, 2],
    );
    const all = [...p1.items, ...p2.items];
    assert.equal(new Set(all.map((r) => r.id)).size, 7);
    assert.ok(
      all.every((r) => /^[A-Z][a-z]+ [A-Z]\.$/.test(r.reviewerName)),
      "first name + last initial only",
    );
    assert.ok(!JSON.stringify(all).includes("@"), "no email addresses");
    assert.ok(!JSON.stringify(all).includes("Khan"), "no full surnames");
  });

  it("a non-public doctor's reviews are not returned publicly", async () => {
    const doc = await mkDoctor({ token: `Ps${RUN}`, status: "SUSPENDED" });
    const p = await mkPatient();
    const a = await mkAppointment({
      patientId: p.id,
      doctorId: doc.doctor.id,
      hospitalId: null,
      status: "COMPLETED",
    });
    await createReview(p.id, { appointmentId: a.id, rating: 5 });
    assert.equal(
      (await listPublicReviews({ target: "doctor", targetId: doc.doctor.id, page: 1 })).total,
      0,
    );
  });
});
