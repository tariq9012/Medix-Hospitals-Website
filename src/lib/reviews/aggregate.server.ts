import "@tanstack/react-start/server-only";

import { and, eq, isNotNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { reviews } from "@/db/schema";

/**
 * Rating source of truth (Phase 13): ratings are DERIVED at query time from
 * PUBLISHED rows in `reviews` — AVG(rating) and COUNT(*). Nothing is stored
 * or manually updated, so a hidden/edited/added review is reflected
 * immediately and the value cannot drift. (`doctors.rating` /
 * `doctors.total_reviews` are deprecated and unused.)
 *
 * These return aliased subqueries to LEFT JOIN onto doctors / hospitals.
 */
export function doctorRatingAggregate() {
  return db
    .select({
      doctorId: reviews.doctorId,
      avgRating: sql<string>`round(avg(${reviews.rating})::numeric, 2)`.as("avg_rating"),
      reviewCount: sql<number>`count(*)::int`.as("review_count"),
    })
    .from(reviews)
    .where(and(eq(reviews.moderationStatus, "PUBLISHED"), isNotNull(reviews.doctorId)))
    .groupBy(reviews.doctorId)
    .as("doctor_rating_agg");
}

/**
 * Hospital rating = average of PUBLISHED reviews attached to appointments
 * held at that hospital (`reviews.hospital_id` is copied server-side from the
 * verified appointment, never from the browser). It therefore reflects
 * "verified visits at this hospital", which is labelled as such in the UI.
 */
export function hospitalRatingAggregate() {
  return db
    .select({
      hospitalId: reviews.hospitalId,
      avgRating: sql<string>`round(avg(${reviews.rating})::numeric, 2)`.as("avg_rating"),
      reviewCount: sql<number>`count(*)::int`.as("review_count"),
    })
    .from(reviews)
    .where(and(eq(reviews.moderationStatus, "PUBLISHED"), isNotNull(reviews.hospitalId)))
    .groupBy(reviews.hospitalId)
    .as("hospital_rating_agg");
}

export function toRating(
  avg: string | number | null | undefined,
  count: number | null | undefined,
): { rating: number | null; reviewCount: number } {
  const reviewCount = count ?? 0;
  if (reviewCount === 0 || avg === null || avg === undefined)
    return { rating: null, reviewCount: 0 };
  return { rating: Number(avg), reviewCount };
}

export function emptyBreakdown(): Record<1 | 2 | 3 | 4 | 5, number> {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

/** A single doctor's derived rating (used by the doctor portal, which reads its own row directly). */
export async function getDoctorRatingStats(
  doctorId: string,
): Promise<{ rating: number | null; reviewCount: number }> {
  const [row] = await db
    .select({
      avg: sql<string>`round(avg(${reviews.rating})::numeric, 2)`,
      n: sql<number>`count(*)::int`,
    })
    .from(reviews)
    .where(and(eq(reviews.doctorId, doctorId), eq(reviews.moderationStatus, "PUBLISHED")));
  return toRating(row?.avg ?? null, row?.n ?? 0);
}
