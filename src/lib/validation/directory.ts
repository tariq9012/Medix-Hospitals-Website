import { z } from "zod";

import { idSchema } from "./common";

/**
 * Validation for the public directory (doctors / hospitals), reviews and
 * favorites. Search/filter schemas are deliberately LENIENT: a malformed or
 * hostile query-string value falls back to "no filter" instead of throwing,
 * so a bad shared link degrades to a normal page rather than an error page.
 * Every value that survives is constrained (length, charset, enum, range) —
 * nothing here is ever interpolated into SQL (Drizzle parameterizes it).
 */

export const MAX_SEARCH_LENGTH = 80;

const slugParam = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9-]+$/)
  .optional()
  .catch(undefined);

const textParam = (max: number) =>
  z
    .string()
    .transform((s) => s.trim().slice(0, max))
    .transform((s) => (s.length > 0 ? s : undefined))
    .optional()
    .catch(undefined);

const numParam = (min: number, max: number, int = false) =>
  z
    .preprocess(
      (v) => (v === "" || v === null || v === undefined ? undefined : v),
      (int ? z.coerce.number().int() : z.coerce.number()).min(min).max(max).optional(),
    )
    .catch(undefined);

const pageParam = z
  .preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.coerce.number().int().min(1).max(10_000).default(1),
  )
  .catch(1);

// --- Doctors ------------------------------------------------------------------

/** The ONLY sort keys the client may request; each maps to a fixed ORDER BY server-side. */
export const DOCTOR_SORTS = [
  "recommended",
  "rating",
  "reviews",
  "fee_asc",
  "fee_desc",
  "experience",
] as const;
export type DoctorSort = (typeof DOCTOR_SORTS)[number];

export const doctorSearchSchema = z.object({
  q: textParam(MAX_SEARCH_LENGTH),
  specialty: slugParam,
  hospital: slugParam,
  city: textParam(120),
  minFee: numParam(0, 10_000_000),
  maxFee: numParam(0, 10_000_000),
  minRating: numParam(1, 5),
  minExperience: numParam(0, 70, true),
  mode: z.enum(["ONLINE", "IN_PERSON"]).optional().catch(undefined),
  /** "1" => only doctors that currently publish at least one active availability rule. */
  scheduled: z
    .preprocess(
      (v) => (v === true || v === "1" || v === 1 ? "1" : undefined),
      z.literal("1").optional(),
    )
    .catch(undefined),
  sort: z.enum(DOCTOR_SORTS).default("recommended").catch("recommended"),
  page: pageParam,
  pageSize: z
    .preprocess(
      (v) => (v === "" || v === null ? undefined : v),
      z.coerce.number().int().min(1).max(50).default(12),
    )
    .catch(12),
});
export type DoctorSearchInput = z.infer<typeof doctorSearchSchema>;

// --- Hospitals ----------------------------------------------------------------

export const HOSPITAL_SORTS = ["recommended", "rating", "reviews", "name", "doctors"] as const;
export type HospitalSort = (typeof HOSPITAL_SORTS)[number];

export const hospitalSearchSchema = z.object({
  q: textParam(MAX_SEARCH_LENGTH),
  specialty: slugParam,
  city: textParam(120),
  department: textParam(120),
  service: textParam(120),
  sort: z.enum(HOSPITAL_SORTS).default("recommended").catch("recommended"),
  page: pageParam,
  pageSize: z
    .preprocess(
      (v) => (v === "" || v === null ? undefined : v),
      z.coerce.number().int().min(1).max(50).default(12),
    )
    .catch(12),
});
export type HospitalSearchInput = z.infer<typeof hospitalSearchSchema>;

// --- Detail lookups -------------------------------------------------------------

/** A public profile is addressed by its slug; a UUID is also accepted so pre-Phase-13 links keep working. */
export const profileKeySchema = z.object({ key: z.string().trim().min(1).max(200) });
export const slugSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/),
});

export const reviewsPageSchema = z.object({
  target: z.enum(["doctor", "hospital"]),
  targetId: idSchema,
  page: pageParam,
});

// --- Reviews --------------------------------------------------------------------

export const REVIEW_COMMENT_MIN = 10;
export const REVIEW_COMMENT_MAX = 1500;

/** Anything shaped like an HTML/script tag, plus C0 control characters (except \t \n \r). */
const HTML_LIKE = /<\s*[a-zA-Z/!?]/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export const reviewCommentSchema = z
  .string()
  .transform((s) => s.replace(/\r\n/g, "\n").trim())
  .refine((s) => s.length <= REVIEW_COMMENT_MAX, {
    message: `Comment must be ${REVIEW_COMMENT_MAX} characters or fewer.`,
  })
  .refine((s) => !CONTROL_CHARS.test(s), { message: "Comment contains invalid characters." })
  .refine((s) => !HTML_LIKE.test(s), { message: "Comment must be plain text (no HTML)." })
  .refine((s) => s.length === 0 || (s.length >= REVIEW_COMMENT_MIN && /[\p{L}\p{N}]/u.test(s)), {
    message: `Comment must be at least ${REVIEW_COMMENT_MIN} characters, or left empty.`,
  });

/**
 * The ONLY fields a browser may supply when reviewing. patientId, doctorId
 * and hospitalId are never accepted — the server derives them from the
 * authenticated patient's own COMPLETED appointment.
 */
export const reviewInputSchema = z.object({
  rating: z.coerce
    .number()
    .int()
    .min(1, "Choose a rating from 1 to 5.")
    .max(5, "Choose a rating from 1 to 5."),
  comment: reviewCommentSchema.optional().default(""),
});
export type ReviewInput = z.infer<typeof reviewInputSchema>;

export const createReviewSchema = reviewInputSchema.extend({ appointmentId: idSchema });
export const updateReviewSchema = reviewInputSchema.extend({ reviewId: idSchema });
export const reviewIdSchema = z.object({ reviewId: idSchema });
export const appointmentReviewQuerySchema = z.object({ appointmentId: idSchema });

export const moderationHideSchema = z.object({
  reviewId: idSchema,
  reason: z
    .string()
    .transform((s) => s.trim())
    .refine((s) => s.length >= 5 && s.length <= 500, {
      message: "Give a moderation reason between 5 and 500 characters.",
    }),
});

export const adminReviewFiltersSchema = z.object({
  status: z.enum(["ALL", "PUBLISHED", "HIDDEN"]).default("ALL").catch("ALL"),
  page: pageParam,
});

// --- Favorites ------------------------------------------------------------------

export const setDoctorFavoriteSchema = z.object({ doctorId: idSchema, favorite: z.boolean() });
export const setHospitalFavoriteSchema = z.object({ hospitalId: idSchema, favorite: z.boolean() });
