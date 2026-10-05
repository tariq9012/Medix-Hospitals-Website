import "@tanstack/react-start/server-only";

import { and, desc, eq, isNotNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { appointments, doctors, hospitals, patientProfiles, reviews, users } from "@/db/schema";
import type { HomepageReview, Paginated, PublicReview } from "@/lib/directory/types";
import {
  PUBLIC_DOCTOR_CONDITION,
  PUBLIC_HOSPITAL_CONDITION,
} from "@/lib/directory/visibility.server";

export const REVIEWS_PAGE_SIZE = 5;

/** "Tariq Khan" -> "Tariq K." — never the email, never the full surname. */
export function displayName(first: string | null, last: string | null): string {
  const f = first?.trim();
  if (!f) return "Patient";
  const l = last?.trim();
  return l ? `${f} ${l[0]!.toUpperCase()}.` : f;
}

function toPublic(r: {
  id: string;
  rating: number;
  reviewText: string | null;
  createdAt: Date;
  editedAt: Date | null;
  firstName: string | null;
  lastName: string | null;
}): PublicReview {
  return {
    id: r.id,
    rating: r.rating,
    comment: r.reviewText,
    reviewerName: displayName(r.firstName, r.lastName),
    createdAt: r.createdAt.toISOString(),
    edited: r.editedAt !== null,
  };
}

/**
 * Server-side paginated PUBLISHED reviews for a doctor or hospital. Returns an
 * empty page unless the target is itself publicly visible (so a suspended
 * doctor's reviews are not exposed) — historical rows stay in the DB.
 */
export async function listPublicReviews(params: {
  target: "doctor" | "hospital";
  targetId: string;
  page: number;
  pageSize?: number;
}): Promise<Paginated<PublicReview>> {
  const pageSize = Math.min(params.pageSize ?? REVIEWS_PAGE_SIZE, 20);
  const empty: Paginated<PublicReview> = { items: [], page: 1, pageSize, total: 0, totalPages: 1 };

  if (params.target === "doctor") {
    const [ok] = await db
      .select({ id: doctors.id })
      .from(doctors)
      .innerJoin(users, eq(users.id, doctors.userId))
      .where(and(eq(doctors.id, params.targetId), PUBLIC_DOCTOR_CONDITION))
      .limit(1);
    if (!ok) return empty;
  } else {
    const [ok] = await db
      .select({ id: hospitals.id })
      .from(hospitals)
      .where(and(eq(hospitals.id, params.targetId), PUBLIC_HOSPITAL_CONDITION))
      .limit(1);
    if (!ok) return empty;
  }

  const targetCol = params.target === "doctor" ? reviews.doctorId : reviews.hospitalId;
  const where = and(eq(targetCol, params.targetId), eq(reviews.moderationStatus, "PUBLISHED"));

  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(reviews)
    .where(where);
  const total = countRow?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(params.page, totalPages);

  const rows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      reviewText: reviews.reviewText,
      createdAt: reviews.createdAt,
      editedAt: reviews.editedAt,
      firstName: patientProfiles.firstName,
      lastName: patientProfiles.lastName,
    })
    .from(reviews)
    .leftJoin(patientProfiles, eq(patientProfiles.userId, reviews.patientId))
    .where(where)
    .orderBy(desc(reviews.createdAt), desc(reviews.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return { items: rows.map(toPublic), page, pageSize, total, totalPages };
}

/** Newest PUBLISHED reviews that have a written comment, for PUBLICLY VISIBLE doctors (homepage). */
export async function listRecentPublicReviews(limit: number): Promise<HomepageReview[]> {
  const rows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      reviewText: reviews.reviewText,
      createdAt: reviews.createdAt,
      editedAt: reviews.editedAt,
      firstName: patientProfiles.firstName,
      lastName: patientProfiles.lastName,
      docFirst: doctors.firstName,
      docLast: doctors.lastName,
      docSlug: doctors.slug,
    })
    .from(reviews)
    .innerJoin(doctors, eq(doctors.id, reviews.doctorId))
    .innerJoin(users, eq(users.id, doctors.userId))
    .leftJoin(patientProfiles, eq(patientProfiles.userId, reviews.patientId))
    .where(
      and(
        eq(reviews.moderationStatus, "PUBLISHED"),
        isNotNull(reviews.reviewText),
        PUBLIC_DOCTOR_CONDITION,
      ),
    )
    .orderBy(desc(reviews.createdAt), desc(reviews.id))
    .limit(Math.min(limit, 12));
  return rows.map((r) => ({
    ...toPublic(r),
    doctorName: `Dr. ${r.docFirst} ${r.docLast}`,
    doctorSlug: r.docSlug,
  }));
}

export interface MyReview {
  id: string;
  appointmentId: string | null;
  rating: number;
  comment: string | null;
  status: "PENDING" | "PUBLISHED" | "HIDDEN" | "REJECTED";
  /** Who hid it: the patient themself or a moderator. */
  hiddenBy: "SELF" | "MODERATION" | null;
  hiddenReason: string | null;
  createdAt: string;
  editedAt: string | null;
  doctorName: string | null;
  doctorSlug: string | null;
  hospitalName: string | null;
}

function toMine(r: {
  id: string;
  appointmentId: string | null;
  rating: number;
  reviewText: string | null;
  status: MyReview["status"];
  hiddenByUserId: string | null;
  hiddenReason: string | null;
  createdAt: Date;
  editedAt: Date | null;
  patientId: string;
  docFirst: string | null;
  docLast: string | null;
  docSlug: string | null;
  hospitalName: string | null;
}): MyReview {
  return {
    id: r.id,
    appointmentId: r.appointmentId,
    rating: r.rating,
    comment: r.reviewText,
    status: r.status,
    hiddenBy:
      r.status === "HIDDEN" ? (r.hiddenByUserId === r.patientId ? "SELF" : "MODERATION") : null,
    hiddenReason: r.status === "HIDDEN" && r.hiddenByUserId !== r.patientId ? r.hiddenReason : null,
    createdAt: r.createdAt.toISOString(),
    editedAt: r.editedAt?.toISOString() ?? null,
    doctorName: r.docFirst ? `Dr. ${r.docFirst} ${r.docLast}` : null,
    doctorSlug: r.docSlug,
    hospitalName: r.hospitalName,
  };
}

const mineSelect = {
  id: reviews.id,
  appointmentId: reviews.appointmentId,
  rating: reviews.rating,
  reviewText: reviews.reviewText,
  status: reviews.moderationStatus,
  hiddenByUserId: reviews.hiddenByUserId,
  hiddenReason: reviews.hiddenReason,
  createdAt: reviews.createdAt,
  editedAt: reviews.editedAt,
  patientId: reviews.patientId,
  docFirst: doctors.firstName,
  docLast: doctors.lastName,
  docSlug: doctors.slug,
  hospitalName: hospitals.name,
};

/** Every review the authenticated patient wrote, including ones they removed or a moderator hid. */
export async function listMyReviews(patientId: string): Promise<MyReview[]> {
  const rows = await db
    .select(mineSelect)
    .from(reviews)
    .leftJoin(doctors, eq(doctors.id, reviews.doctorId))
    .leftJoin(hospitals, eq(hospitals.id, reviews.hospitalId))
    .where(eq(reviews.patientId, patientId))
    .orderBy(desc(reviews.createdAt));
  return rows.map(toMine);
}

export interface AppointmentReviewState {
  appointmentId: string;
  /** True only for the owner's COMPLETED appointment that has no review yet. */
  canReview: boolean;
  review: MyReview | null;
}

/** Null when the appointment doesn't exist OR isn't the caller's (indistinguishable by design). */
export async function getAppointmentReviewState(
  patientId: string,
  appointmentId: string,
): Promise<AppointmentReviewState | null> {
  const [appt] = await db
    .select({ id: appointments.id, status: appointments.status })
    .from(appointments)
    .where(and(eq(appointments.id, appointmentId), eq(appointments.patientId, patientId)))
    .limit(1);
  if (!appt) return null;

  const [row] = await db
    .select(mineSelect)
    .from(reviews)
    .leftJoin(doctors, eq(doctors.id, reviews.doctorId))
    .leftJoin(hospitals, eq(hospitals.id, reviews.hospitalId))
    .where(and(eq(reviews.appointmentId, appointmentId), eq(reviews.patientId, patientId)))
    .limit(1);

  return {
    appointmentId: appt.id,
    canReview: appt.status === "COMPLETED" && !row,
    review: row ? toMine(row) : null,
  };
}

export interface AdminReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  status: MyReview["status"];
  hiddenReason: string | null;
  hiddenBy: "PATIENT" | "ADMIN" | null;
  reviewerName: string;
  doctorName: string | null;
  hospitalName: string | null;
  createdAt: string;
}

export async function listAdminReviews(params: {
  status: "ALL" | "PUBLISHED" | "HIDDEN";
  page: number;
  pageSize?: number;
}): Promise<Paginated<AdminReviewRow>> {
  const pageSize = Math.min(params.pageSize ?? 20, 50);
  const where = params.status === "ALL" ? undefined : eq(reviews.moderationStatus, params.status);

  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(reviews)
    .where(where);
  const total = countRow?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(params.page, totalPages);

  const rows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      reviewText: reviews.reviewText,
      status: reviews.moderationStatus,
      hiddenReason: reviews.hiddenReason,
      hiddenByUserId: reviews.hiddenByUserId,
      patientId: reviews.patientId,
      createdAt: reviews.createdAt,
      firstName: patientProfiles.firstName,
      lastName: patientProfiles.lastName,
      docFirst: doctors.firstName,
      docLast: doctors.lastName,
      hospitalName: hospitals.name,
    })
    .from(reviews)
    .leftJoin(patientProfiles, eq(patientProfiles.userId, reviews.patientId))
    .leftJoin(doctors, eq(doctors.id, reviews.doctorId))
    .leftJoin(hospitals, eq(hospitals.id, reviews.hospitalId))
    .where(where)
    .orderBy(desc(reviews.createdAt), desc(reviews.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    items: rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.reviewText,
      status: r.status,
      hiddenReason: r.hiddenReason,
      hiddenBy:
        r.status === "HIDDEN"
          ? r.hiddenByUserId === r.patientId
            ? ("PATIENT" as const)
            : ("ADMIN" as const)
          : null,
      reviewerName: displayName(r.firstName, r.lastName),
      doctorName: r.docFirst ? `Dr. ${r.docFirst} ${r.docLast}` : null,
      hospitalName: r.hospitalName,
      createdAt: r.createdAt.toISOString(),
    })),
    page,
    pageSize,
    total,
    totalPages,
  };
}

/** A doctor's own VISIBLE reviews (read-only; doctors have no edit/delete/reply path). */
export async function listDoctorOwnReviews(
  doctorId: string,
  page: number,
  pageSize = 10,
): Promise<Paginated<PublicReview>> {
  const where = and(eq(reviews.doctorId, doctorId), eq(reviews.moderationStatus, "PUBLISHED"));
  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(reviews)
    .where(where);
  const total = countRow?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(page, totalPages);
  const rows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      reviewText: reviews.reviewText,
      createdAt: reviews.createdAt,
      editedAt: reviews.editedAt,
      firstName: patientProfiles.firstName,
      lastName: patientProfiles.lastName,
    })
    .from(reviews)
    .leftJoin(patientProfiles, eq(patientProfiles.userId, reviews.patientId))
    .where(where)
    .orderBy(desc(reviews.createdAt), desc(reviews.id))
    .limit(pageSize)
    .offset((p - 1) * pageSize);
  return { items: rows.map(toPublic), page: p, pageSize, total, totalPages };
}
