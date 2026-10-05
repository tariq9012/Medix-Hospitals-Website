import "@tanstack/react-start/server-only";

import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { appointments, auditLogs, doctors, reviews, type Review } from "@/db/schema";
import type { JsonObject } from "@/db/schema/json";
import type { AuditAction } from "@/lib/auth/audit.server";
import { createNotification } from "@/lib/notifications/service.server";
import { moderationHideSchema, reviewInputSchema } from "@/lib/validation/directory";

import { ReviewError } from "./errors";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** IP/UA are best-effort: outside a live request (seed, tests) they're simply null. */
function requestMeta(): { ipAddress: string | null; userAgent: string | null } {
  try {
    return {
      ipAddress: getRequestIP({ xForwardedFor: true }) ?? null,
      userAgent: getRequestHeader("user-agent") ?? null,
    };
  } catch {
    return { ipAddress: null, userAgent: null };
  }
}

/**
 * Audit rows are written INSIDE the same transaction as the change they
 * describe, so a review can never change without its audit entry (or vice
 * versa). Metadata holds ids/ratings/flags only — NEVER review text.
 */
async function audit(
  tx: Tx,
  params: { actorUserId: string; action: AuditAction; reviewId: string; metadata?: JsonObject },
) {
  await tx.insert(auditLogs).values({
    actorUserId: params.actorUserId,
    action: params.action,
    entityType: "review",
    entityId: params.reviewId,
    metadata: params.metadata,
    ...requestMeta(),
  });
}

function parseInput(input: { rating: unknown; comment?: unknown }) {
  const parsed = reviewInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ReviewError("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid review.");
  }
  return { rating: parsed.data.rating, comment: parsed.data.comment };
}

/**
 * Creates a review for the authenticated patient's OWN, COMPLETED appointment.
 *
 * patientId comes from the session. doctorId / hospitalId / appointmentId are
 * DERIVED from that appointment row — the browser supplies only the
 * appointment id (as a lookup key, re-checked for ownership here) plus rating
 * and comment. A foreign, nonexistent, pending or cancelled appointment is
 * rejected; a second review for the same appointment is stopped by the
 * `reviews_appointment_unique` constraint (ON CONFLICT DO NOTHING ⇒ clean error).
 */
export async function createReview(
  patientId: string,
  input: { appointmentId: string; rating: unknown; comment?: unknown },
): Promise<Review> {
  const { rating, comment } = parseInput(input);

  const created = await db.transaction(async (tx) => {
    const [appt] = await tx
      .select({
        id: appointments.id,
        patientId: appointments.patientId,
        doctorId: appointments.doctorId,
        hospitalId: appointments.hospitalId,
        status: appointments.status,
      })
      .from(appointments)
      // Ownership is part of the query: someone else's appointment is indistinguishable from a missing one.
      .where(and(eq(appointments.id, input.appointmentId), eq(appointments.patientId, patientId)))
      .limit(1);

    if (!appt) throw new ReviewError("NOT_FOUND", "Appointment not found.");
    if (appt.status !== "COMPLETED") {
      throw new ReviewError(
        "NOT_COMPLETED",
        "You can review an appointment only after it has been completed.",
      );
    }

    const [row] = await tx
      .insert(reviews)
      .values({
        patientId: appt.patientId,
        doctorId: appt.doctorId,
        hospitalId: appt.hospitalId,
        appointmentId: appt.id,
        rating,
        reviewText: comment.length > 0 ? comment : null,
        moderationStatus: "PUBLISHED",
      })
      .onConflictDoNothing({ target: reviews.appointmentId })
      .returning();

    if (!row) {
      throw new ReviewError("ALREADY_REVIEWED", "You have already reviewed this appointment.");
    }

    await audit(tx, {
      actorUserId: patientId,
      action: "REVIEW_CREATED",
      reviewId: row.id,
      metadata: { rating, hasComment: comment.length > 0 },
    });
    return row;
  });

  // Best-effort, generic notification to the doctor — no patient or appointment details.
  const [doc] = await db
    .select({ userId: doctors.userId })
    .from(doctors)
    .where(eq(doctors.id, created.doctorId!))
    .limit(1);
  if (doc) {
    await createNotification({
      userId: doc.userId,
      type: "SYSTEM",
      title: "New patient review",
      message: `A patient left a ${rating}-star review on your profile.`,
      metadata: { kind: "REVIEW_RECEIVED" },
    });
  }
  return created;
}

async function loadOwnReview(tx: Tx, patientId: string, reviewId: string): Promise<Review> {
  const [row] = await tx
    .select()
    .from(reviews)
    .where(and(eq(reviews.id, reviewId), eq(reviews.patientId, patientId)))
    .limit(1);
  // Not the author ⇒ same answer as "doesn't exist". Doctors, hospital admins
  // and other patients therefore can never edit someone else's review.
  if (!row) throw new ReviewError("NOT_FOUND", "Review not found.");
  return row;
}

/** The author edits their own PUBLISHED review. Tracks `editedAt`; provider/admin have no edit path. */
export async function updateOwnReview(
  patientId: string,
  input: { reviewId: string; rating: unknown; comment?: unknown },
): Promise<Review> {
  const { rating, comment } = parseInput(input);
  return db.transaction(async (tx) => {
    const current = await loadOwnReview(tx, patientId, input.reviewId);
    if (current.moderationStatus !== "PUBLISHED") {
      throw new ReviewError("NOT_EDITABLE", "This review is hidden and can't be edited.");
    }
    const newText = comment.length > 0 ? comment : null;
    const textChanged = (current.reviewText ?? null) !== newText;
    if (!textChanged && current.rating === rating) return current;

    const now = new Date();
    const [row] = await tx
      .update(reviews)
      .set({ rating, reviewText: newText, editedAt: now, updatedAt: now })
      .where(eq(reviews.id, current.id))
      .returning();
    await audit(tx, {
      actorUserId: patientId,
      action: "REVIEW_UPDATED",
      reviewId: current.id,
      metadata: { previousRating: current.rating, rating, textChanged },
    });
    return row!;
  });
}

/** Patient removes (hides) their own review. Row is kept; idempotent. */
export async function removeOwnReview(patientId: string, reviewId: string): Promise<Review> {
  return db.transaction(async (tx) => {
    const current = await loadOwnReview(tx, patientId, reviewId);
    if (current.moderationStatus === "HIDDEN") return current;
    if (current.moderationStatus !== "PUBLISHED") {
      throw new ReviewError("NOT_EDITABLE", "This review can't be removed.");
    }
    const now = new Date();
    const [row] = await tx
      .update(reviews)
      .set({
        moderationStatus: "HIDDEN",
        hiddenAt: now,
        hiddenByUserId: patientId,
        hiddenReason: null,
        updatedAt: now,
      })
      .where(eq(reviews.id, current.id))
      .returning();
    await audit(tx, {
      actorUserId: patientId,
      action: "REVIEW_HIDDEN",
      reviewId: current.id,
      metadata: { by: "PATIENT" },
    });
    return row!;
  });
}

/** Patient re-publishes a review THEY removed. A review hidden by a moderator cannot be restored by its author. */
export async function restoreOwnReview(patientId: string, reviewId: string): Promise<Review> {
  return db.transaction(async (tx) => {
    const current = await loadOwnReview(tx, patientId, reviewId);
    if (current.moderationStatus === "PUBLISHED") return current;
    if (current.moderationStatus !== "HIDDEN" || current.hiddenByUserId !== patientId) {
      throw new ReviewError(
        "FORBIDDEN_ACTION",
        "This review was hidden by moderation and can't be restored.",
      );
    }
    const [row] = await tx
      .update(reviews)
      .set({
        moderationStatus: "PUBLISHED",
        hiddenAt: null,
        hiddenByUserId: null,
        hiddenReason: null,
        updatedAt: new Date(),
      })
      .where(eq(reviews.id, current.id))
      .returning();
    await audit(tx, {
      actorUserId: patientId,
      action: "REVIEW_RESTORED",
      reviewId: current.id,
      metadata: { by: "PATIENT" },
    });
    return row!;
  });
}

/**
 * Platform-admin moderation: hide a review for an explicit reason. The row,
 * its text and its rating are preserved (only visibility changes), and the
 * action is audited. The caller (server function) has already enforced
 * `requireAdmin()`. Admins can hide/restore but never edit review content.
 */
export async function adminHideReview(
  adminUserId: string,
  input: { reviewId: string; reason: string },
): Promise<Review> {
  const parsed = moderationHideSchema.safeParse(input);
  if (!parsed.success) {
    throw new ReviewError("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid reason.");
  }
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(reviews)
      .where(eq(reviews.id, parsed.data.reviewId))
      .limit(1);
    if (!current) throw new ReviewError("NOT_FOUND", "Review not found.");
    if (current.moderationStatus === "HIDDEN") {
      throw new ReviewError("ALREADY_HIDDEN", "This review is already hidden.");
    }
    const now = new Date();
    const [row] = await tx
      .update(reviews)
      .set({
        moderationStatus: "HIDDEN",
        hiddenAt: now,
        hiddenByUserId: adminUserId,
        hiddenReason: parsed.data.reason,
        updatedAt: now,
      })
      .where(eq(reviews.id, current.id))
      .returning();
    await audit(tx, {
      actorUserId: adminUserId,
      action: "REVIEW_HIDDEN",
      reviewId: current.id,
      metadata: { by: "ADMIN", reasonLength: parsed.data.reason.length },
    });
    return row!;
  });
}

/** Admin un-hides a review that a MODERATOR hid (never one the patient chose to remove). */
export async function adminRestoreReview(adminUserId: string, reviewId: string): Promise<Review> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(reviews).where(eq(reviews.id, reviewId)).limit(1);
    if (!current) throw new ReviewError("NOT_FOUND", "Review not found.");
    if (current.moderationStatus !== "HIDDEN") {
      throw new ReviewError("NOT_HIDDEN", "This review is not hidden.");
    }
    if (current.hiddenByUserId === current.patientId) {
      throw new ReviewError(
        "FORBIDDEN_ACTION",
        "The patient removed this review themselves; only they can restore it.",
      );
    }
    const [row] = await tx
      .update(reviews)
      .set({
        moderationStatus: "PUBLISHED",
        hiddenAt: null,
        hiddenByUserId: null,
        hiddenReason: null,
        updatedAt: new Date(),
      })
      .where(eq(reviews.id, current.id))
      .returning();
    await audit(tx, {
      actorUserId: adminUserId,
      action: "REVIEW_RESTORED",
      reviewId: current.id,
      metadata: { by: "ADMIN" },
    });
    return row!;
  });
}
