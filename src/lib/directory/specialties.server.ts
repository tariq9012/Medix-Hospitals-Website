import "@tanstack/react-start/server-only";

import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  doctors,
  doctorSpecialties,
  hospitals,
  hospitalSpecialties,
  specialties,
  users,
} from "@/db/schema";

import type { PublicSpecialtySummary } from "./types";
import { PUBLIC_DOCTOR_CONDITION, PUBLIC_HOSPITAL_CONDITION } from "./visibility.server";

/**
 * All specialties with REAL provider counts (only publicly visible doctors /
 * hospitals are counted). Descriptions are whatever is stored in the DB —
 * null is passed through, never invented.
 */
export async function listPublicSpecialties(opts?: {
  onlyWithProviders?: boolean;
}): Promise<PublicSpecialtySummary[]> {
  const [all, doctorCounts, hospitalCounts] = await Promise.all([
    db.select().from(specialties).orderBy(asc(specialties.name)),
    db
      .select({
        specialtyId: doctorSpecialties.specialtyId,
        n: sql<number>`count(distinct ${doctors.id})::int`,
      })
      .from(doctorSpecialties)
      .innerJoin(doctors, eq(doctors.id, doctorSpecialties.doctorId))
      .innerJoin(users, eq(users.id, doctors.userId))
      .where(PUBLIC_DOCTOR_CONDITION)
      .groupBy(doctorSpecialties.specialtyId),
    db
      .select({
        specialtyId: hospitalSpecialties.specialtyId,
        n: sql<number>`count(distinct ${hospitals.id})::int`,
      })
      .from(hospitalSpecialties)
      .innerJoin(hospitals, eq(hospitals.id, hospitalSpecialties.hospitalId))
      .where(PUBLIC_HOSPITAL_CONDITION)
      .groupBy(hospitalSpecialties.specialtyId),
  ]);

  const dBy = new Map(doctorCounts.map((r) => [r.specialtyId, r.n]));
  const hBy = new Map(hospitalCounts.map((r) => [r.specialtyId, r.n]));
  const list = all.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    description: s.description,
    doctorCount: dBy.get(s.id) ?? 0,
    hospitalCount: hBy.get(s.id) ?? 0,
  }));
  return opts?.onlyWithProviders ? list.filter((s) => s.doctorCount + s.hospitalCount > 0) : list;
}

export async function getPublicSpecialtyBySlug(
  slug: string,
): Promise<PublicSpecialtySummary | null> {
  const all = await listPublicSpecialties();
  return all.find((s) => s.slug === slug) ?? null;
}
