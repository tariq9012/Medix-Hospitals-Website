import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { and, eq } from "drizzle-orm";

import { db } from "../../src/db";
import { doctors, favoriteDoctors, favoriteHospitals } from "../../src/db/schema";
import { applyProviderVerificationDecision } from "../../src/lib/admin/verification.server";
import { searchPublicDoctors } from "../../src/lib/directory/doctors.server";
import { FavoriteError } from "../../src/lib/favorites/errors";
import {
  listFavoriteDoctors,
  listFavoriteHospitals,
  setDoctorFavorite,
  setHospitalFavorite,
} from "../../src/lib/favorites/service.server";
import { doctorSearchSchema, setDoctorFavoriteSchema } from "../../src/lib/validation/directory";

import { RUN, closeDb, mkDoctor, mkHospital, mkPatient, mkUser } from "./fixtures";

after(closeDb);

/** Drizzle wraps Postgres errors ("Failed query…"); the constraint name lives in `cause`. */
const dbRejects = (p: Promise<unknown>, re: RegExp) =>
  assert.rejects(p, (e: unknown) => {
    const err = e as { message?: string; cause?: { message?: string } };
    return re.test(`${err.message ?? ""} ${err.cause?.message ?? ""}`);
  });

const countFav = async (patientId: string, doctorId: string) =>
  (
    await db
      .select()
      .from(favoriteDoctors)
      .where(and(eq(favoriteDoctors.patientId, patientId), eq(favoriteDoctors.doctorId, doctorId)))
  ).length;

describe("favorite doctors", () => {
  it("add, duplicate-add (idempotent), remove, remove-again (idempotent)", async () => {
    const p = await mkPatient();
    const { doctor } = await mkDoctor({ token: `Fv${RUN}` });
    assert.deepEqual(await setDoctorFavorite(p.id, doctor.id, true), { favorite: true });
    await setDoctorFavorite(p.id, doctor.id, true);
    assert.equal(await countFav(p.id, doctor.id), 1, "duplicate did not create a second row");
    await setDoctorFavorite(p.id, doctor.id, false);
    assert.equal(await countFav(p.id, doctor.id), 0);
    assert.deepEqual(await setDoctorFavorite(p.id, doctor.id, false), { favorite: false });
  });

  it("rapid double-click / concurrent requests never create duplicates (DB unique pair + ON CONFLICT)", async () => {
    const p = await mkPatient();
    const { doctor } = await mkDoctor({ token: `Fc${RUN}` });
    const results = await Promise.allSettled(
      Array.from({ length: 25 }, () => setDoctorFavorite(p.id, doctor.id, true)),
    );
    assert.ok(
      results.every((r) => r.status === "fulfilled"),
      "no request errored",
    );
    assert.equal(await countFav(p.id, doctor.id), 1);
    await dbRejects(
      db.insert(favoriteDoctors).values({ patientId: p.id, doctorId: doctor.id }),
      /favorite_doctors_patient_doctor_unique|duplicate key/,
    );
  });

  it("isolation: Patient B cannot create/delete/list Patient A's favorites (identity is the session patient)", async () => {
    const a = await mkPatient();
    const b = await mkPatient();
    const { doctor } = await mkDoctor({ token: `Fi${RUN}` });
    await setDoctorFavorite(a.id, doctor.id, true);

    // B "removing" the doctor only touches B's own (nonexistent) row.
    await setDoctorFavorite(b.id, doctor.id, false);
    assert.equal(await countFav(a.id, doctor.id), 1, "A's favorite untouched by B");

    // B's list never contains A's favorites.
    assert.equal((await listFavoriteDoctors(b.id)).available.length, 0);
    assert.equal((await listFavoriteDoctors(a.id)).available.length, 1);

    // The browser-facing schema has no patientId field at all.
    const parsed = setDoctorFavoriteSchema.parse({
      doctorId: doctor.id,
      favorite: true,
      patientId: a.id,
    });
    assert.deepEqual(Object.keys(parsed).sort(), ["doctorId", "favorite"]);

    // B favoriting creates a row for B only.
    await setDoctorFavorite(b.id, doctor.id, true);
    assert.equal(await countFav(b.id, doctor.id), 1);
    assert.equal(await countFav(a.id, doctor.id), 1);
  });

  it("cannot favorite a non-public doctor", async () => {
    const p = await mkPatient();
    const { doctor } = await mkDoctor({ token: `Fn${RUN}`, status: "PENDING" });
    await assert.rejects(setDoctorFavorite(p.id, doctor.id, true), FavoriteError);
    assert.equal(await countFav(p.id, doctor.id), 0);
  });

  it("suspended doctor: favorite row is KEPT, shown as unavailable (name only), and returns on reactivation", async () => {
    const p = await mkPatient();
    const admin = await mkUser("ADMIN", "admin");
    const { doctor } = await mkDoctor({ token: `Fs${RUN}` });
    await setDoctorFavorite(p.id, doctor.id, true);
    const act = (action: "SUSPEND" | "REACTIVATE", reason?: string) =>
      applyProviderVerificationDecision(admin.id, {
        providerType: "DOCTOR",
        providerId: doctor.id,
        action,
        reason,
      } as never);

    await act("SUSPEND", "suspended for favorites test");
    assert.equal(await countFav(p.id, doctor.id), 1, "row not destroyed");
    const during = await listFavoriteDoctors(p.id);
    assert.equal(during.available.length, 0);
    assert.deepEqual(during.unavailable, [
      {
        id: doctor.id,
        name: `Dr. ${(await db.select().from(doctors).where(eq(doctors.id, doctor.id)))[0]!.firstName} Fs${RUN}`,
      },
    ]);
    assert.deepEqual(
      Object.keys(during.unavailable[0]!).sort(),
      ["id", "name"],
      "nothing else leaks",
    );

    await act("REACTIVATE");
    const after = await listFavoriteDoctors(p.id);
    assert.equal(after.available.length, 1);
    assert.equal(after.unavailable.length, 0);
  });

  it("directory cards reflect real DB favorite state per viewer (and null for non-patients / signed-out)", async () => {
    const p = await mkPatient();
    const other = await mkPatient();
    const token = `Fd${RUN}`;
    const { doctor } = await mkDoctor({ token });
    await setDoctorFavorite(p.id, doctor.id, true);
    const q = doctorSearchSchema.parse({ q: token });
    assert.equal(
      (await searchPublicDoctors(q, { userId: p.id, role: "PATIENT" })).items[0]!.isFavorite,
      true,
    );
    assert.equal(
      (await searchPublicDoctors(q, { userId: other.id, role: "PATIENT" })).items[0]!.isFavorite,
      false,
    );
    assert.equal((await searchPublicDoctors(q, null)).items[0]!.isFavorite, null);
    assert.equal(
      (await searchPublicDoctors(q, { userId: other.id, role: "DOCTOR" })).items[0]!.isFavorite,
      null,
    );
  });
});

describe("favorite hospitals", () => {
  it("add / duplicate / remove / isolation / suspension behavior", async () => {
    const a = await mkPatient();
    const b = await mkPatient();
    const admin = await mkUser("ADMIN", "admin");
    const h = await mkHospital();
    const count = async (pid: string) =>
      (
        await db
          .select()
          .from(favoriteHospitals)
          .where(and(eq(favoriteHospitals.patientId, pid), eq(favoriteHospitals.hospitalId, h.id)))
      ).length;

    await Promise.all(Array.from({ length: 15 }, () => setHospitalFavorite(a.id, h.id, true)));
    assert.equal(await count(a.id), 1, "concurrent adds → one row");
    await setHospitalFavorite(b.id, h.id, false);
    assert.equal(await count(a.id), 1, "B cannot remove A's favorite");
    assert.equal((await listFavoriteHospitals(b.id)).available.length, 0);
    assert.equal((await listFavoriteHospitals(a.id)).available.length, 1);

    await applyProviderVerificationDecision(admin.id, {
      providerType: "HOSPITAL",
      providerId: h.id,
      action: "SUSPEND",
      reason: "suspended for favorites test",
    } as never);
    assert.equal(await count(a.id), 1, "row kept");
    const during = await listFavoriteHospitals(a.id);
    assert.equal(during.available.length, 0);
    assert.equal(during.unavailable.length, 1);
    await assert.rejects(
      setHospitalFavorite(b.id, h.id, true),
      FavoriteError,
      "can't newly favorite a suspended hospital",
    );

    await applyProviderVerificationDecision(admin.id, {
      providerType: "HOSPITAL",
      providerId: h.id,
      action: "REACTIVATE",
    } as never);
    assert.equal((await listFavoriteHospitals(a.id)).available.length, 1);

    await setHospitalFavorite(a.id, h.id, false);
    assert.equal(await count(a.id), 0);
  });
});
