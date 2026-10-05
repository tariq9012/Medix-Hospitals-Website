import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { eq } from "drizzle-orm";

import { db } from "../../src/db";
import { doctors, hospitals, reviews } from "../../src/db/schema";
import { applyProviderVerificationDecision } from "../../src/lib/admin/verification.server";
import { searchPublicDoctors, getPublicDoctorByKey } from "../../src/lib/directory/doctors.server";
import {
  getPublicHospitalByKey,
  searchPublicHospitals,
} from "../../src/lib/directory/hospitals.server";
import { doctorSearchSchema, hospitalSearchSchema } from "../../src/lib/validation/directory";

import {
  RUN,
  closeDb,
  countQueries,
  mkAppointment,
  mkDoctor,
  mkHospital,
  mkPatient,
  mkSpecialty,
  mkUser,
} from "./fixtures";

const search = (raw: Record<string, unknown>) =>
  searchPublicDoctors(doctorSearchSchema.parse(raw), null);
const hsearch = (raw: Record<string, unknown>) =>
  searchPublicHospitals(hospitalSearchSchema.parse(raw), null);

after(closeDb);

describe("provider visibility policy (server-side)", () => {
  const token = `Vis${RUN}`;
  const ids: Record<string, string> = {};

  before(async () => {
    for (const status of ["APPROVED", "PENDING", "REJECTED", "SUSPENDED"] as const) {
      const { doctor } = await mkDoctor({ token, status, first: status });
      ids[status] = doctor.id;
    }
    ids["USER_SUSPENDED"] = (
      await mkDoctor({ token, first: "UserSuspended", userStatus: "SUSPENDED" })
    ).doctor.id;
    ids["UNAVAILABLE"] = (
      await mkDoctor({ token, first: "Unavailable", isAvailable: false })
    ).doctor.id;
  });

  it("shows only the approved/active/available doctor; pending, rejected, suspended, suspended-account and unavailable are hidden", async () => {
    const r = await search({ q: token });
    assert.equal(r.total, 1);
    assert.equal(r.items[0]!.id, ids["APPROVED"]);
  });

  it("hidden doctors are also hidden from the detail route (by slug and by id)", async () => {
    for (const k of ["PENDING", "REJECTED", "SUSPENDED", "USER_SUSPENDED", "UNAVAILABLE"]) {
      const [row] = await db.select().from(doctors).where(eq(doctors.id, ids[k]!));
      assert.equal(await getPublicDoctorByKey(row!.slug, null), null, `${k} by slug`);
      assert.equal(await getPublicDoctorByKey(row!.id, null), null, `${k} by id`);
    }
    const [ok] = await db.select().from(doctors).where(eq(doctors.id, ids["APPROVED"]!));
    assert.ok(await getPublicDoctorByKey(ok!.slug, null));
    assert.ok(await getPublicDoctorByKey(ok!.id, null), "legacy UUID links still resolve");
  });
});

describe("admin lifecycle: pending → approve → suspend → reactivate (real admin service)", () => {
  it("doctor: appears only while APPROVED; history survives", async () => {
    const admin = await mkUser("ADMIN", "admin");
    const patient = await mkPatient();
    const token = `Life${RUN}`;
    const { doctor } = await mkDoctor({ token, status: "PENDING" });
    const decide = (action: "APPROVE" | "SUSPEND" | "REACTIVATE", reason?: string) =>
      applyProviderVerificationDecision(admin.id, {
        providerType: "DOCTOR",
        providerId: doctor.id,
        action,
        reason,
      } as never);

    assert.equal((await search({ q: token })).total, 0, "pending hidden");
    await decide("APPROVE");
    assert.equal((await search({ q: token })).total, 1, "approved visible");

    // History that must survive suspension.
    const appt = await mkAppointment({
      patientId: patient.id,
      doctorId: doctor.id,
      hospitalId: null,
      status: "COMPLETED",
    });
    await db.insert(reviews).values({
      patientId: patient.id,
      doctorId: doctor.id,
      appointmentId: appt.id,
      rating: 5,
      reviewText: "Great doctor, would recommend.",
      moderationStatus: "PUBLISHED",
    });

    await decide("SUSPEND", "policy violation reason text");
    assert.equal((await search({ q: token })).total, 0, "suspended hidden from directory/search");
    assert.equal((await search({ q: token, specialty: "x" })).total, 0);

    const stillThere = await db.select().from(reviews).where(eq(reviews.doctorId, doctor.id));
    assert.equal(stillThere.length, 1, "review row preserved");
    assert.equal(stillThere[0]!.moderationStatus, "PUBLISHED");

    await decide("REACTIVATE");
    const back = await search({ q: token });
    assert.equal(back.total, 1, "reactivated visible again");
    assert.equal(back.items[0]!.reviewCount, 1, "historical review intact and counted");
    assert.equal(back.items[0]!.rating, 5);
  });

  it("hospital: appears only while APPROVED; its doctors stay linked", async () => {
    const admin = await mkUser("ADMIN", "admin");
    const h = await mkHospital({ status: "PENDING" });
    await mkDoctor({ token: `HL${RUN}`, hospitalId: h.id });
    const find = async () => (await hsearch({ q: h.name })).items.filter((i) => i.id === h.id);
    const decide = (action: "APPROVE" | "SUSPEND" | "REACTIVATE", reason?: string) =>
      applyProviderVerificationDecision(admin.id, {
        providerType: "HOSPITAL",
        providerId: h.id,
        action,
        reason,
      } as never);

    assert.equal((await find()).length, 0);
    await decide("APPROVE");
    assert.equal((await find()).length, 1);
    assert.ok(await getPublicHospitalByKey(h.slug, null));
    await decide("SUSPEND", "suspended for testing purposes");
    assert.equal((await find()).length, 0);
    assert.equal(await getPublicHospitalByKey(h.slug, null), null);
    const [row] = await db.select().from(hospitals).where(eq(hospitals.id, h.id));
    assert.ok(row, "hospital row retained");
    await decide("REACTIVATE");
    assert.equal((await find()).length, 1);
  });

  it("a doctor affiliated with a suspended hospital stays public but the hospital is not listed on their card", async () => {
    const h = await mkHospital({ status: "SUSPENDED" });
    const token = `Aff${RUN}`;
    await mkDoctor({ token, hospitalId: h.id });
    const r = await search({ q: token });
    assert.equal(r.total, 1);
    assert.equal(r.items[0]!.hospitals.length, 0);
  });
});

describe("search, filters, sort, pagination", () => {
  const token = `Sx${RUN}`;
  let spec: Awaited<ReturnType<typeof mkSpecialty>>;
  let hospA: Awaited<ReturnType<typeof mkHospital>>;
  let hospB: Awaited<ReturnType<typeof mkHospital>>;
  let cheap: string, mid: string, pricey: string;

  before(async () => {
    spec = await mkSpecialty("cardio");
    hospA = await mkHospital({ city: `CityA${RUN}`, name: `Alpha Care ${RUN}` });
    hospB = await mkHospital({ city: `CityB${RUN}`, name: `Beta Care ${RUN}` });
    cheap = (
      await mkDoctor({
        token,
        first: "Cheap",
        fee: "1000.00",
        years: 3,
        specialtyId: spec.id,
        hospitalId: hospA.id,
        qualifications: ["MBBS", `ZzQual${RUN}Alpha`],
        availability: "ONLINE",
      })
    ).doctor.id;
    mid = (
      await mkDoctor({
        token,
        first: "Mid",
        fee: "2500.00",
        years: 10,
        hospitalId: hospB.id,
        availability: "BOTH",
      })
    ).doctor.id;
    pricey = (
      await mkDoctor({
        token,
        first: "Pricey",
        fee: "5000.00",
        years: 20,
        specialtyId: spec.id,
        hospitalId: hospA.id,
        availability: "NONE",
      })
    ).doctor.id;
  });

  it("matches by name, qualification, specialty name, hospital name, and city", async () => {
    assert.equal((await search({ q: `Dr. Cheap ${token}` })).total, 1, "title + multi-term name");
    assert.equal((await search({ q: `ZzQual${RUN}Alpha` })).total, 1, "qualification");
    assert.equal((await search({ q: spec.name })).total, 2, "specialty name");
    assert.equal((await search({ q: `Alpha Care ${RUN}` })).total, 2, "hospital name");
    assert.equal((await search({ q: `CityB${RUN}` })).total, 1, "city");
  });

  it("filters: specialty, hospital, city, fee range, experience, mode, scheduled", async () => {
    assert.equal((await search({ q: token, specialty: spec.slug })).total, 2);
    assert.equal((await search({ q: token, hospital: hospB.slug })).total, 1);
    assert.equal(
      (await search({ q: token, city: `cityb${RUN}` })).total,
      1,
      "city is case-insensitive exact",
    );
    assert.equal((await search({ q: token, minFee: "2000", maxFee: "3000" })).total, 1);
    assert.equal((await search({ q: token, minExperience: "10" })).total, 2);
    assert.equal((await search({ q: token, mode: "ONLINE" })).total, 2);
    assert.equal((await search({ q: token, mode: "IN_PERSON" })).total, 1);
    assert.equal((await search({ q: token, scheduled: "1" })).total, 2, "pricey has no schedule");
  });

  it("sorting is whitelisted and correct; unknown sort keys fall back safely", async () => {
    const order = async (sort: string) => (await search({ q: token, sort })).items.map((i) => i.id);
    assert.deepEqual(await order("fee_asc"), [cheap, mid, pricey]);
    assert.deepEqual(await order("fee_desc"), [pricey, mid, cheap]);
    assert.deepEqual(await order("experience"), [pricey, mid, cheap]);
    const injected = doctorSearchSchema.parse({ sort: "fee_asc; DROP TABLE users;--" });
    assert.equal(injected.sort, "recommended");
    await search({ q: token, sort: "fee_asc; DROP TABLE users;--" }); // must not throw
  });

  it("rating sort + minRating use real reviews only", async () => {
    const p1 = await mkPatient();
    const p2 = await mkPatient();
    for (const [p, doc, rating] of [
      [p1, mid, 5],
      [p2, mid, 4],
      [p1, cheap, 3],
    ] as const) {
      const a = await mkAppointment({
        patientId: p.id,
        doctorId: doc,
        hospitalId: null,
        status: "COMPLETED",
      });
      await db.insert(reviews).values({
        patientId: p.id,
        doctorId: doc,
        appointmentId: a.id,
        rating,
        moderationStatus: "PUBLISHED",
      });
    }
    const ranked = (await search({ q: token, sort: "rating" })).items;
    assert.deepEqual(
      ranked.map((i) => i.id),
      [mid, cheap, pricey],
    );
    assert.equal(ranked[0]!.rating, 4.5);
    assert.equal(ranked[0]!.reviewCount, 2);
    assert.equal((await search({ q: token, minRating: "4" })).total, 1);
    assert.equal((await search({ q: token, sort: "reviews" })).items[0]!.id, mid);
  });

  it("never shows a fake rating: unreviewed doctor => null/0 even though doctors.rating column says 4.90", async () => {
    const r = await search({ q: token });
    const unreviewed = r.items.find((i) => i.id === pricey)!;
    assert.equal(unreviewed.rating, null);
    assert.equal(unreviewed.reviewCount, 0);
  });

  it("server-side pagination returns the right slice, clamps the page, and never overlaps", async () => {
    const ptoken = `Pg${RUN}`;
    for (let i = 0; i < 5; i++) await mkDoctor({ token: ptoken, first: `N${i}` });
    const p1 = await search({ q: ptoken, pageSize: "2", page: "1", sort: "fee_asc" });
    const p2 = await search({ q: ptoken, pageSize: "2", page: "2", sort: "fee_asc" });
    const p3 = await search({ q: ptoken, pageSize: "2", page: "3", sort: "fee_asc" });
    assert.deepEqual([p1.total, p1.pageSize, p1.totalPages], [5, 2, 3]);
    assert.deepEqual([p1.items.length, p2.items.length, p3.items.length], [2, 2, 1]);
    const all = [...p1.items, ...p2.items, ...p3.items].map((i) => i.id);
    assert.equal(new Set(all).size, 5);
    const beyond = await search({ q: ptoken, pageSize: "2", page: "99" });
    assert.equal(beyond.page, 3, "page clamped to last page");
    assert.equal(
      doctorSearchSchema.parse({ pageSize: "9999" }).pageSize,
      12,
      "oversized pageSize rejected → default",
    );
  });

  it("hostile / malformed input never errors and never matches via SQL tricks", async () => {
    for (const q of ["%", "_", "' OR 1=1 --", "\\", "a".repeat(5000), "; DROP TABLE doctors"]) {
      const r = await search({ q, specialty: "A B!", minFee: "abc", page: "-4", mode: "BOGUS" });
      assert.ok(r.total >= 0);
    }
    assert.equal(
      doctorSearchSchema.parse({ q: "x".repeat(500) }).q!.length,
      80,
      "search length capped",
    );
    assert.equal((await search({ q: "%" })).total, 0, "wildcards are matched literally");
  });
});

describe("public DTOs expose no private fields", () => {
  it("doctor and hospital payloads contain no emails, hashes, license numbers or verification data", async () => {
    const token = `Dto${RUN}`;
    const h = await mkHospital();
    await mkDoctor({ token, hospitalId: h.id });
    const list = await search({ q: token });
    const [row] = await db.select().from(doctors).where(eq(doctors.id, list.items[0]!.id));
    const detail = await getPublicDoctorByKey(row!.slug, null);
    const hosp = await getPublicHospitalByKey(h.slug, null);
    const blob = JSON.stringify({ list, detail, hosp });
    for (const forbidden of [
      "passwordHash",
      "LIC-SECRET",
      "internal-reason-secret",
      "verificationStatus",
      "verificationReason",
      "medicalLicenseNumber",
      "userId",
    ]) {
      assert.ok(!blob.includes(forbidden), `payload leaked: ${forbidden}`);
    }
    assert.ok(!/p13\.(doctor|patient)\.[^"]*@example\.com/.test(blob), "no user email in payload");
    assert.deepEqual(Object.keys(list.items[0]!).sort(), [
      "consultationFee",
      "hasSchedule",
      "hospitals",
      "id",
      "isFavorite",
      "modes",
      "name",
      "primarySpecialty",
      "profileImage",
      "qualifications",
      "rating",
      "reviewCount",
      "slug",
      "specialties",
      "yearsOfExperience",
    ]);
  });

  it("hospital detail excludes non-public doctors and any admin/internal data", async () => {
    const h = await mkHospital();
    const ok = await mkDoctor({ token: `Hd${RUN}`, hospitalId: h.id });
    await mkDoctor({ token: `Hd${RUN}`, hospitalId: h.id, status: "SUSPENDED" });
    await mkDoctor({ token: `Hd${RUN}`, hospitalId: h.id, status: "PENDING" });
    const detail = await getPublicHospitalByKey(h.slug, null);
    assert.deepEqual(
      detail!.doctors.map((d) => d.id),
      [ok.doctor.id],
    );
    assert.equal(detail!.doctorCount, 1);
    const keys = Object.keys(detail!);
    for (const k of [
      "verificationStatus",
      "verificationReason",
      "admins",
      "staff",
      "appointments",
      "invoices",
    ]) {
      assert.ok(!keys.includes(k), `hospital detail exposes ${k}`);
    }
  });
});

describe("query efficiency (no N+1)", () => {
  it("directory SQL statement count is constant regardless of page size", async () => {
    const token = `Qc${RUN}`;
    const h = await mkHospital();
    for (let i = 0; i < 8; i++) await mkDoctor({ token, first: `Q${i}`, hospitalId: h.id });
    const small = await countQueries(() => search({ q: token, pageSize: "2" }));
    const large = await countQueries(() => search({ q: token, pageSize: "8" }));
    assert.equal(small.result.items.length, 2);
    assert.equal(large.result.items.length, 8);
    assert.ok(small.queries > 0, "query counter is wired");
    assert.equal(large.queries, small.queries, "same number of statements for 2 vs 8 doctors");
    assert.ok(large.queries <= 6, `expected ≤6 statements, got ${large.queries}`);
  });
});
