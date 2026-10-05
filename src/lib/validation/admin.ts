import { z } from "zod";

import { idSchema, paginationSchema } from "./common";
import {
  appointmentStatusSchema,
  userRoleSchema,
  userStatusSchema,
  verificationStatusSchema,
} from "./enums";

export const providerTypeSchema = z.enum(["DOCTOR", "HOSPITAL"]);

/**
 * The verification decisions an admin may request. The legal
 * from→to transitions themselves are enforced by the matrix in
 * `src/lib/admin/verification.server.ts`, not here.
 */
export const verificationActionSchema = z.enum([
  "APPROVE",
  "REJECT",
  "SUSPEND",
  "REACTIVATE",
  "REOPEN",
]);

/** REJECT and SUSPEND require a substantive reason; it's persisted, never UI-only. */
const reasonSchema = z
  .string()
  .trim()
  .min(10, "Please give a reason of at least 10 characters.")
  .max(1000);

export const providerVerificationDecisionSchema = z
  .object({
    providerType: providerTypeSchema,
    providerId: idSchema,
    action: verificationActionSchema,
    reason: reasonSchema.optional(),
  })
  .refine((data) => !["REJECT", "SUSPEND"].includes(data.action) || Boolean(data.reason), {
    message: "A reason is required when rejecting or suspending a provider.",
    path: ["reason"],
  });

export const adminUserFiltersSchema = paginationSchema.extend({
  role: userRoleSchema.optional(),
  status: userStatusSchema.optional(),
  search: z.string().trim().max(200).optional(),
});

export const adminDoctorFiltersSchema = paginationSchema.extend({
  verificationStatus: verificationStatusSchema.optional(),
  status: userStatusSchema.optional(),
  search: z.string().trim().max(200).optional(),
});

export const adminHospitalFiltersSchema = paginationSchema.extend({
  verificationStatus: verificationStatusSchema.optional(),
  city: z.string().trim().max(120).optional(),
  search: z.string().trim().max(200).optional(),
});

export const adminAppointmentFiltersSchema = paginationSchema.extend({
  status: appointmentStatusSchema.optional(),
  search: z.string().trim().max(200).optional(),
});

export const adminAuditFiltersSchema = paginationSchema.extend({
  action: z.string().trim().max(150).optional(),
  actorUserId: idSchema.optional(),
  fromDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  toDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const adminUserStatusActionSchema = z
  .object({
    userId: idSchema,
    action: z.enum(["SUSPEND", "REACTIVATE"]),
    reason: reasonSchema.optional(),
  })
  .refine((data) => data.action !== "SUSPEND" || Boolean(data.reason), {
    message: "A reason is required when suspending an account.",
    path: ["reason"],
  });

export type ProviderType = z.infer<typeof providerTypeSchema>;
export type VerificationAction = z.infer<typeof verificationActionSchema>;
export type ProviderVerificationDecisionInput = z.infer<typeof providerVerificationDecisionSchema>;
export type AdminUserFilters = z.infer<typeof adminUserFiltersSchema>;
export type AdminDoctorFilters = z.infer<typeof adminDoctorFiltersSchema>;
export type AdminHospitalFilters = z.infer<typeof adminHospitalFiltersSchema>;
export type AdminAppointmentFilters = z.infer<typeof adminAppointmentFiltersSchema>;
export type AdminAuditFilters = z.infer<typeof adminAuditFiltersSchema>;
export type AdminUserStatusActionInput = z.infer<typeof adminUserStatusActionSchema>;
