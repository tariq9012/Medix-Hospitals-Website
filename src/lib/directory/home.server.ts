import "@tanstack/react-start/server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { doctors, hospitals, reviews as reviewsTable, users } from "@/db/schema";
import { listRecentPublicReviews } from "@/lib/reviews/queries.server";

import { listFeaturedDoctors } from "./doctors.server";
import { getHospitalFilterOptions, listFeaturedHospitals } from "./hospitals.server";
import { listPublicSpecialties } from "./specialties.server";
import type {
  DirectoryViewer,
  HomepageReview,
  PublicDoctorCard,
  PublicHospitalCard,
  PublicSpecialtySummary,
} from "./types";
import { PUBLIC_DOCTOR_CONDITION, PUBLIC_HOSPITAL_CONDITION } from "./visibility.server";

export interface HomepageData {
  stats: { doctors: number; hospitals: number; specialties: number };
  specialties: PublicSpecialtySummary[];
  doctors: PublicDoctorCard[];
  hospitals: PublicHospitalCard[];
  reviews: HomepageReview[];
  cities: string[];
}

/**
 * Everything the homepage shows about providers, from PostgreSQL only.
 * Featured rule (explicit + deterministic): publicly visible providers ordered
 * by average rating, then review count, then name — labelled "Featured" /
 * "Popular", never "Top".
 */
export async function getHomepageData(viewer: DirectoryViewer | null): Promise<HomepageData> {
  const [
    [doctorCount],
    [hospitalCount],
    specialtyList,
    featuredDoctors,
    featuredHospitals,
    reviews,
    hospitalOptions,
  ] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(doctors)
      .innerJoin(users, eq(users.id, doctors.userId))
      .where(PUBLIC_DOCTOR_CONDITION),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(hospitals)
      .where(PUBLIC_HOSPITAL_CONDITION),
    listPublicSpecialties({ onlyWithProviders: true }),
    listFeaturedDoctors(6, viewer),
    listFeaturedHospitals(3, viewer),
    listRecentPublicReviews(3),
    getHospitalFilterOptions(),
  ]);

  return {
    stats: {
      doctors: doctorCount?.n ?? 0,
      hospitals: hospitalCount?.n ?? 0,
      specialties: specialtyList.length,
    },
    specialties: [...specialtyList]
      .sort((a, b) => b.doctorCount - a.doctorCount || a.name.localeCompare(b.name))
      .slice(0, 8),
    doctors: featuredDoctors,
    hospitals: featuredHospitals,
    reviews,
    cities: hospitalOptions.cities,
  };
}

/** Real platform counts for static marketing pages (About). Only publicly visible providers/reviews are counted. */
export async function getPublicStats() {
  const [[d], [h], [r], specialtyList] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(doctors)
      .innerJoin(users, eq(users.id, doctors.userId))
      .where(PUBLIC_DOCTOR_CONDITION),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(hospitals)
      .where(PUBLIC_HOSPITAL_CONDITION),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(reviewsTable)
      .innerJoin(doctors, eq(doctors.id, reviewsTable.doctorId))
      .innerJoin(users, eq(users.id, doctors.userId))
      .where(and(eq(reviewsTable.moderationStatus, "PUBLISHED"), PUBLIC_DOCTOR_CONDITION)),
    listPublicSpecialties({ onlyWithProviders: true }),
  ]);
  return {
    doctors: d?.n ?? 0,
    hospitals: h?.n ?? 0,
    reviews: r?.n ?? 0,
    specialties: specialtyList.length,
  };
}
