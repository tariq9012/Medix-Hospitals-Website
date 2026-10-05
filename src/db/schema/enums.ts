import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Centralized Postgres enum definitions.
 *
 * Keeping these in one place makes it easy to see every constrained status
 * value used across the schema, and avoids the same logical enum being
 * redefined slightly differently in two tables.
 */

// --- Identity -------------------------------------------------------------

/** Authenticated user roles. Authorization/RBAC is implemented in Phase 3. */
export const userRoleEnum = pgEnum("user_role", ["PATIENT", "DOCTOR", "HOSPITAL_ADMIN", "ADMIN"]);

/** Account-level status, independent of profile/verification status. */
export const userStatusEnum = pgEnum("user_status", [
  "ACTIVE",
  "PENDING_VERIFICATION",
  "SUSPENDED",
  "DEACTIVATED",
]);

export const genderEnum = pgEnum("gender", ["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"]);

export const bloodGroupEnum = pgEnum("blood_group", [
  "A_POS",
  "A_NEG",
  "B_POS",
  "B_NEG",
  "AB_POS",
  "AB_NEG",
  "O_POS",
  "O_NEG",
]);

// --- Verification / moderation --------------------------------------------

/** Shared by doctor and hospital verification. */
/**
 * Shared by doctor and hospital verification. Deliberately separate from
 * `userStatusEnum` — a provider's account can be ACTIVE while their
 * provider verification is PENDING/REJECTED/SUSPENDED, and vice versa.
 */
export const verificationStatusEnum = pgEnum("verification_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "SUSPENDED",
]);

export const moderationStatusEnum = pgEnum("moderation_status", [
  "PENDING",
  "PUBLISHED",
  "HIDDEN",
  "REJECTED",
]);

// --- Scheduling / appointments ---------------------------------------------

export const dayOfWeekEnum = pgEnum("day_of_week", [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
]);

export const consultationTypeEnum = pgEnum("consultation_type", ["ONLINE", "IN_PERSON"]);

export const appointmentStatusEnum = pgEnum("appointment_status", [
  "PENDING",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
]);

// --- Payments ---------------------------------------------------------------

/**
 * Shared by `appointments.paymentStatus` (a coarse, display-only convenience
 * field — original 4 values only) and `payments.status` (Phase 12; also uses
 * CANCELLED and PARTIALLY_REFUNDED). Values are additive over the original
 * Phase-1..11 set, so nothing that already reads `appointments.paymentStatus`
 * needs to change.
 */
export const paymentStatusEnum = pgEnum("payment_status", [
  "PENDING",
  "PAID",
  "FAILED",
  "REFUNDED",
  "CANCELLED",
  "PARTIALLY_REFUNDED",
]);

// --- Billing (Phase 12) -----------------------------------------------------

/**
 * No real payment gateway exists yet (Phase 12 spec, §2/§11/§34): these are
 * internal settlement records only, never a live card/bank charge.
 */
export const paymentMethodEnum = pgEnum("payment_method", ["CASH", "MANUAL", "TEST"]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "DRAFT",
  "ISSUED",
  "PARTIALLY_PAID",
  "PAID",
  "VOID",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
]);

export const refundStatusEnum = pgEnum("refund_status", ["COMPLETED", "FAILED"]);

// --- Prescriptions & documents ----------------------------------------------

export const prescriptionStatusEnum = pgEnum("prescription_status", ["ACTIVE", "COMPLETED"]);

export const documentTypeEnum = pgEnum("document_category", [
  "LAB_REPORT",
  "IMAGING_REPORT",
  "DIAGNOSTIC_REPORT",
  "DISCHARGE_SUMMARY",
  "REFERRAL",
  "CLINICAL_ATTACHMENT",
  "OTHER",
]);

// --- Notifications ------------------------------------------------------------

export const notificationTypeEnum = pgEnum("notification_type", [
  "APPOINTMENT_CONFIRMED",
  "APPOINTMENT_CANCELLED",
  "APPOINTMENT_COMPLETED",
  "APPOINTMENT_REMINDER",
  "PRESCRIPTION_AVAILABLE",
  "MEDICAL_RECORD_AVAILABLE",
  "MEDICAL_DOCUMENT_AVAILABLE",
  "NEW_MESSAGE",
  "VERIFICATION_APPROVED",
  "VERIFICATION_REJECTED",
  "VERIFICATION_SUSPENDED",
  "PAYMENT_CONFIRMATION",
  "INVOICE_ISSUED",
  "PAYMENT_RECORDED",
  "REFUND_RECORDED",
  "SYSTEM",
]);
