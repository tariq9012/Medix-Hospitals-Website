import "@tanstack/react-start/server-only";

import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";

import { db } from "@/db";
import { auditLogs, type JsonObject } from "@/db/schema";

export type AuditAction =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "REGISTER"
  | "PASSWORD_RESET_REQUESTED"
  | "PASSWORD_RESET_COMPLETED"
  | "ACCOUNT_BLOCKED"
  | "SESSION_REVOKED"
  | "APPOINTMENT_CREATED"
  | "APPOINTMENT_CANCELLED"
  | "APPOINTMENT_VIEWED"
  | "DOCTOR_APPOINTMENT_CONFIRMED"
  | "DOCTOR_APPOINTMENT_COMPLETED"
  | "DOCTOR_APPOINTMENT_NO_SHOW"
  | "DOCTOR_APPOINTMENT_CANCELLED"
  | "DOCTOR_AVAILABILITY_CREATED"
  | "DOCTOR_AVAILABILITY_UPDATED"
  | "DOCTOR_AVAILABILITY_DISABLED"
  | "DOCTOR_PROFILE_UPDATED"
  | "ADMIN_DOCTOR_APPROVED"
  | "ADMIN_DOCTOR_REJECTED"
  | "ADMIN_DOCTOR_SUSPENDED"
  | "ADMIN_DOCTOR_REACTIVATED"
  | "ADMIN_DOCTOR_REOPENED"
  | "ADMIN_HOSPITAL_APPROVED"
  | "ADMIN_HOSPITAL_REJECTED"
  | "ADMIN_HOSPITAL_SUSPENDED"
  | "ADMIN_HOSPITAL_REACTIVATED"
  | "ADMIN_HOSPITAL_REOPENED"
  | "ADMIN_USER_SUSPENDED"
  | "ADMIN_USER_REACTIVATED"
  | "HOSPITAL_PROFILE_UPDATED"
  | "HOSPITAL_DOCTOR_AFFILIATED"
  | "HOSPITAL_DOCTOR_REMOVED"
  | "HOSPITAL_DEPARTMENT_CREATED"
  | "HOSPITAL_DEPARTMENT_UPDATED"
  | "HOSPITAL_DEPARTMENT_DISABLED"
  | "HOSPITAL_SERVICE_CREATED"
  | "HOSPITAL_SERVICE_UPDATED"
  | "HOSPITAL_SERVICE_DISABLED"
  | "MEDICAL_RECORD_CREATED"
  | "MEDICAL_RECORD_UPDATED"
  | "MEDICAL_RECORD_VIEWED"
  | "PRESCRIPTION_CREATED"
  | "PRESCRIPTION_UPDATED"
  | "PRESCRIPTION_VIEWED"
  | "MEDICAL_DOCUMENT_UPLOADED"
  | "MEDICAL_DOCUMENT_VIEWED"
  | "MEDICAL_DOCUMENT_DOWNLOADED"
  | "CONVERSATION_CREATED"
  | "MESSAGE_SENT"
  | "NOTIFICATIONS_MARKED_READ"
  | "INVOICE_CREATED"
  | "INVOICE_VOIDED"
  | "PAYMENT_RECORDED"
  | "REFUND_RECORDED"
  | "REVIEW_CREATED"
  | "REVIEW_UPDATED"
  | "REVIEW_HIDDEN"
  | "REVIEW_RESTORED";

/** @deprecated kept as an alias — use {@link AuditAction}. */
export type AuthAuditAction = AuditAction;

/**
 * Writes an auth event to the shared `audit_logs` table. Never pass
 * passwords, session tokens, or raw reset tokens in `metadata` — this
 * function doesn't scrub input, so that responsibility stays with the
 * caller (each call site below is deliberately narrow about what it logs).
 *
 * `entityType` defaults to `"user"` for backward compatibility with every
 * existing call site. Clinical call sites (medical records, prescriptions)
 * pass an explicit entity type so the audit log records what kind of
 * record was touched — never the clinical content itself (diagnosis,
 * symptoms, notes, medication instructions must never appear in `metadata`).
 */
export async function recordAuthAuditEvent(params: {
  actorUserId: string | null;
  action: AuditAction;
  entityType?: string;
  entityId?: string | null;
  metadata?: JsonObject;
}): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actorUserId: params.actorUserId,
      action: params.action,
      entityType: params.entityType ?? "user",
      entityId: params.entityId ?? params.actorUserId ?? undefined,
      metadata: params.metadata,
      ipAddress: getRequestIP({ xForwardedFor: true }),
      userAgent: getRequestHeader("user-agent"),
    });
  } catch (error) {
    // Auditing must never block or fail the auth flow it's observing.
    console.error("[audit] failed to record auth event", params.action, error);
  }
}
