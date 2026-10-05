import { createServerFn } from "@tanstack/react-start";
import { isRedirect } from "@tanstack/react-router";

import { requireAdmin, requireRole } from "@/lib/auth/authorization.server";
import { requireDoctorRecord } from "@/lib/doctor/queries.server";
import {
  adminReviewFiltersSchema,
  appointmentReviewQuerySchema,
  createReviewSchema,
  moderationHideSchema,
  reviewIdSchema,
  reviewsPageSchema,
  updateReviewSchema,
} from "@/lib/validation/directory";

import { ReviewError } from "./errors";
import { getDoctorRatingStats } from "./aggregate.server";
import {
  getAppointmentReviewState,
  listAdminReviews,
  listDoctorOwnReviews,
  listMyReviews,
} from "./queries.server";
import {
  adminHideReview,
  adminRestoreReview,
  createReview,
  removeOwnReview,
  restoreOwnReview,
  updateOwnReview,
} from "./service.server";

type SimpleResult = { ok: true } | { ok: false; message: string };

function toActionError(error: unknown): { message: string } {
  // Auth helpers signal "not allowed" by throwing a redirect; it must propagate.
  if (isRedirect(error)) throw error;
  if (error instanceof ReviewError) return { message: error.message };
  console.error("[reviews] unexpected error:", error);
  return { message: "Something went wrong. Please try again." };
}

// --- Patient ---------------------------------------------------------------------

export const getAppointmentReviewFn = createServerFn({ method: "GET" })
  .validator(appointmentReviewQuerySchema)
  .handler(async ({ data }) => {
    const user = await requireRole("PATIENT");
    try {
      return await getAppointmentReviewState(user.id, data.appointmentId);
    } catch (error) {
      console.error("[reviews] getAppointmentReviewFn failed:", error);
      return null;
    }
  });

export const createReviewFn = createServerFn({ method: "POST" })
  .validator(createReviewSchema)
  .handler(async ({ data }): Promise<SimpleResult> => {
    try {
      // Identity from the session; provider ids are derived from the appointment server-side.
      const user = await requireRole("PATIENT");
      await createReview(user.id, data);
      return { ok: true };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

export const updateReviewFn = createServerFn({ method: "POST" })
  .validator(updateReviewSchema)
  .handler(async ({ data }): Promise<SimpleResult> => {
    try {
      const user = await requireRole("PATIENT");
      await updateOwnReview(user.id, data);
      return { ok: true };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

export const removeReviewFn = createServerFn({ method: "POST" })
  .validator(reviewIdSchema)
  .handler(async ({ data }): Promise<SimpleResult> => {
    try {
      const user = await requireRole("PATIENT");
      await removeOwnReview(user.id, data.reviewId);
      return { ok: true };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

export const restoreReviewFn = createServerFn({ method: "POST" })
  .validator(reviewIdSchema)
  .handler(async ({ data }): Promise<SimpleResult> => {
    try {
      const user = await requireRole("PATIENT");
      await restoreOwnReview(user.id, data.reviewId);
      return { ok: true };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

export const listMyReviewsFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireRole("PATIENT");
  try {
    return await listMyReviews(user.id);
  } catch (error) {
    console.error("[reviews] listMyReviewsFn failed:", error);
    return [];
  }
});

// --- Doctor (read-only) ------------------------------------------------------------

export const getMyDoctorReviewsFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => reviewsPageSchema.pick({ page: true }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const doctor = await requireDoctorRecord();
    const [stats, list] = await Promise.all([
      getDoctorRatingStats(doctor.id),
      listDoctorOwnReviews(doctor.id, data.page),
    ]);
    return { stats, list };
  });

// --- Platform admin moderation -------------------------------------------------------

export const adminListReviewsFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => adminReviewFiltersSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    await requireAdmin();
    return listAdminReviews(data);
  });

export const adminHideReviewFn = createServerFn({ method: "POST" })
  .validator(moderationHideSchema)
  .handler(async ({ data }): Promise<SimpleResult> => {
    try {
      const admin = await requireAdmin();
      await adminHideReview(admin.id, data);
      return { ok: true };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

export const adminRestoreReviewFn = createServerFn({ method: "POST" })
  .validator(reviewIdSchema)
  .handler(async ({ data }): Promise<SimpleResult> => {
    try {
      const admin = await requireAdmin();
      await adminRestoreReview(admin.id, data.reviewId);
      return { ok: true };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });
