import "@tanstack/react-start/server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { doctors, favoriteDoctors, favoriteHospitals, hospitals, users } from "@/db/schema";
import { getPublicDoctorCardsByIds } from "@/lib/directory/doctors.server";
import { getPublicHospitalCardsByIds } from "@/lib/directory/hospitals.server";
import type { PublicDoctorCard, PublicHospitalCard } from "@/lib/directory/types";
import {
  PUBLIC_DOCTOR_CONDITION,
  PUBLIC_HOSPITAL_CONDITION,
} from "@/lib/directory/visibility.server";

import { FavoriteError } from "./errors";

/**
 * Favorites policy
 *  - Identity is ALWAYS the authenticated patient id passed in by the server
 *    function (from the session). There is no patientId parameter a browser
 *    can influence.
 *  - Setting state is idempotent: add = INSERT … ON CONFLICT DO NOTHING on the
 *    unique (patient, provider) pair; remove = DELETE (0 rows is fine). A
 *    double-click / retry can never create a duplicate.
 *  - You can only ADD a provider that is currently public. You can always
 *    REMOVE.
 *  - If a favorited provider later becomes non-public (suspended, etc.) the
 *    row is KEPT (no automatic data loss) and the provider is reported as
 *    `unavailable` in the list; it returns to `available` on reactivation.
 */

export async function setDoctorFavorite(
  patientId: string,
  doctorId: string,
  favorite: boolean,
): Promise<{ favorite: boolean }> {
  if (!favorite) {
    await db
      .delete(favoriteDoctors)
      .where(and(eq(favoriteDoctors.patientId, patientId), eq(favoriteDoctors.doctorId, doctorId)));
    return { favorite: false };
  }
  const [visible] = await db
    .select({ id: doctors.id })
    .from(doctors)
    .innerJoin(users, eq(users.id, doctors.userId))
    .where(and(eq(doctors.id, doctorId), PUBLIC_DOCTOR_CONDITION))
    .limit(1);
  if (!visible) throw new FavoriteError("This doctor is not available.");

  await db
    .insert(favoriteDoctors)
    .values({ patientId, doctorId })
    .onConflictDoNothing({ target: [favoriteDoctors.patientId, favoriteDoctors.doctorId] });
  return { favorite: true };
}

export async function setHospitalFavorite(
  patientId: string,
  hospitalId: string,
  favorite: boolean,
): Promise<{ favorite: boolean }> {
  if (!favorite) {
    await db
      .delete(favoriteHospitals)
      .where(
        and(
          eq(favoriteHospitals.patientId, patientId),
          eq(favoriteHospitals.hospitalId, hospitalId),
        ),
      );
    return { favorite: false };
  }
  const [visible] = await db
    .select({ id: hospitals.id })
    .from(hospitals)
    .where(and(eq(hospitals.id, hospitalId), PUBLIC_HOSPITAL_CONDITION))
    .limit(1);
  if (!visible) throw new FavoriteError("This hospital is not available.");

  await db
    .insert(favoriteHospitals)
    .values({ patientId, hospitalId })
    .onConflictDoNothing({ target: [favoriteHospitals.patientId, favoriteHospitals.hospitalId] });
  return { favorite: true };
}

export interface FavoriteDoctorsResult {
  available: PublicDoctorCard[];
  /** Kept favorites whose doctor is currently not public. Name only — nothing else is exposed. */
  unavailable: { id: string; name: string }[];
}
export interface FavoriteHospitalsResult {
  available: PublicHospitalCard[];
  unavailable: { id: string; name: string }[];
}

export async function listFavoriteDoctors(patientId: string): Promise<FavoriteDoctorsResult> {
  const favs = await db
    .select({
      doctorId: favoriteDoctors.doctorId,
      firstName: doctors.firstName,
      lastName: doctors.lastName,
    })
    .from(favoriteDoctors)
    .innerJoin(doctors, eq(doctors.id, favoriteDoctors.doctorId))
    .where(eq(favoriteDoctors.patientId, patientId))
    .orderBy(desc(favoriteDoctors.createdAt));

  const viewer = { userId: patientId, role: "PATIENT" as const };
  const cards = await getPublicDoctorCardsByIds(
    favs.map((f) => f.doctorId),
    viewer,
  );
  const visible = new Set(cards.map((c) => c.id));
  return {
    available: cards,
    unavailable: favs
      .filter((f) => !visible.has(f.doctorId))
      .map((f) => ({ id: f.doctorId, name: `Dr. ${f.firstName} ${f.lastName}` })),
  };
}

export async function listFavoriteHospitals(patientId: string): Promise<FavoriteHospitalsResult> {
  const favs = await db
    .select({ hospitalId: favoriteHospitals.hospitalId, name: hospitals.name })
    .from(favoriteHospitals)
    .innerJoin(hospitals, eq(hospitals.id, favoriteHospitals.hospitalId))
    .where(eq(favoriteHospitals.patientId, patientId))
    .orderBy(desc(favoriteHospitals.createdAt));

  const viewer = { userId: patientId, role: "PATIENT" as const };
  const cards = await getPublicHospitalCardsByIds(
    favs.map((f) => f.hospitalId),
    viewer,
  );
  const visible = new Set(cards.map((c) => c.id));
  return {
    available: cards,
    unavailable: favs
      .filter((f) => !visible.has(f.hospitalId))
      .map((f) => ({ id: f.hospitalId, name: f.name })),
  };
}
