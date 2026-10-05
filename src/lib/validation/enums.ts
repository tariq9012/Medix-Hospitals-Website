import { z } from "zod";

/**
 * Zod mirrors of the Postgres enums in `src/db/schema/enums.ts`. Keeping
 * these as the single source of truth for *input validation* (as opposed to
 * storage) means API/server-function input can be rejected before it ever
 * reaches a query.
 */

export const userRoleSchema = z.enum(["PATIENT", "DOCTOR", "HOSPITAL_ADMIN", "ADMIN"]);

export const userStatusSchema = z.enum([
  "ACTIVE",
  "PENDING_VERIFICATION",
  "SUSPENDED",
  "DEACTIVATED",
]);

export const verificationStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]);

export const moderationStatusSchema = z.enum(["PENDING", "PUBLISHED", "HIDDEN", "REJECTED"]);

export const consultationTypeSchema = z.enum(["ONLINE", "IN_PERSON"]);

export const dayOfWeekSchema = z.enum([
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
]);

export const appointmentStatusSchema = z.enum([
  "PENDING",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
]);

export const paymentStatusSchema = z.enum(["PENDING", "PAID", "FAILED", "REFUNDED"]);

export type UserRole = z.infer<typeof userRoleSchema>;
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
export type ConsultationType = z.infer<typeof consultationTypeSchema>;
export type DayOfWeek = z.infer<typeof dayOfWeekSchema>;
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;
