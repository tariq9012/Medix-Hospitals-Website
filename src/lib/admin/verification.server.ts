import "@tanstack/react-start/server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { doctors, hospitals, providerVerificationEvents } from "@/db/schema";
import { recordAuthAuditEvent } from "@/lib/auth/audit.server";
import { createNotification } from "@/lib/notifications/service.server";
import type {
  ProviderType,
  ProviderVerificationDecisionInput,
  VerificationAction,
} from "@/lib/validation/admin";
import type { VerificationStatus } from "@/lib/validation/enums";
import type { AuditAction } from "@/lib/auth/audit.server";

export class AdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminError";
  }
}

/**
 * The only legal provider verification transitions. Anything not listed is
 * rejected — there is no generic "set status to X" path anywhere in the
 * admin surface, so a crafted request can't move a provider into an
 * arbitrary state.
 */
const TRANSITION_MATRIX: Record<
  VerificationAction,
  { from: VerificationStatus[]; to: VerificationStatus }
> = {
  APPROVE: { from: ["PENDING"], to: "APPROVED" },
  REJECT: { from: ["PENDING"], to: "REJECTED" },
  SUSPEND: { from: ["APPROVED"], to: "SUSPENDED" },
  REACTIVATE: { from: ["SUSPENDED"], to: "APPROVED" },
  /** Lets an admin put a rejected application back in the queue for a second look. */
  REOPEN: { from: ["REJECTED"], to: "PENDING" },
};

const AUDIT_ACTION: Record<ProviderType, Record<VerificationAction, AuditAction>> = {
  DOCTOR: {
    APPROVE: "ADMIN_DOCTOR_APPROVED",
    REJECT: "ADMIN_DOCTOR_REJECTED",
    SUSPEND: "ADMIN_DOCTOR_SUSPENDED",
    REACTIVATE: "ADMIN_DOCTOR_REACTIVATED",
    REOPEN: "ADMIN_DOCTOR_REOPENED",
  },
  HOSPITAL: {
    APPROVE: "ADMIN_HOSPITAL_APPROVED",
    REJECT: "ADMIN_HOSPITAL_REJECTED",
    SUSPEND: "ADMIN_HOSPITAL_SUSPENDED",
    REACTIVATE: "ADMIN_HOSPITAL_REACTIVATED",
    REOPEN: "ADMIN_HOSPITAL_REOPENED",
  },
};

/**
 * Applies an admin verification decision to a doctor or hospital.
 *
 * The status update AND the permanent `provider_verification_events` row are
 * written in a single transaction, so the system can never report a
 * successful approval while silently losing its audit trail (or vice versa).
 *
 * Suspension deliberately changes ONLY the provider's verification status —
 * it never deletes appointments, medical records, or financial history, and
 * never touches the user's account status (those are separate concepts).
 * The knock-on effects are automatic and read-time: `listBookableDoctors()`
 * requires `APPROVED`, so a suspended doctor immediately stops being
 * bookable, and `requireVerifiedDoctorRecord()` immediately starts blocking
 * operational Doctor Portal actions.
 */
export async function applyProviderVerificationDecision(
  adminUserId: string,
  input: ProviderVerificationDecisionInput,
): Promise<{ previousStatus: VerificationStatus; newStatus: VerificationStatus }> {
  const rule = TRANSITION_MATRIX[input.action];

  const result = await db.transaction(async (tx) => {
    const table = input.providerType === "DOCTOR" ? doctors : hospitals;

    const [existing] = await tx
      .select({ id: table.id, verificationStatus: table.verificationStatus })
      .from(table)
      .where(eq(table.id, input.providerId))
      .limit(1);

    if (!existing) {
      throw new AdminError(`${input.providerType === "DOCTOR" ? "Doctor" : "Hospital"} not found.`);
    }

    const previousStatus = existing.verificationStatus;
    if (!rule.from.includes(previousStatus)) {
      throw new AdminError(
        `Cannot ${input.action.toLowerCase()} a provider that is currently ${previousStatus.toLowerCase()}.`,
      );
    }

    await tx
      .update(table)
      .set({
        verificationStatus: rule.to,
        // Only rejection/suspension carry a reason forward; approving or
        // reopening clears the stale one so old text can't linger.
        verificationReason: input.reason ?? null,
        verificationReviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(table.id, input.providerId));

    await tx.insert(providerVerificationEvents).values({
      providerType: input.providerType,
      providerId: input.providerId,
      previousStatus,
      newStatus: rule.to,
      reason: input.reason,
      reviewedByUserId: adminUserId,
    });

    return { previousStatus, newStatus: rule.to };
  });

  await recordAuthAuditEvent({
    actorUserId: adminUserId,
    action: AUDIT_ACTION[input.providerType][input.action],
    entityId: input.providerId,
    metadata: {
      providerType: input.providerType,
      previousStatus: result.previousStatus,
      newStatus: result.newStatus,
      // The reason itself is persisted on the provider row and in
      // provider_verification_events; only its presence is noted here.
      hasReason: Boolean(input.reason),
    },
  });

  // Best-effort notification to the affected doctor's own account. Only
  // implemented for DOCTOR here — a hospital doesn't have a single
  // reliable "the account" to notify (see src/lib/admin/verification.server.ts
  // module doc / README), so hospital verification decisions aren't
  // notified in this phase.
  if (input.providerType === "DOCTOR") {
    await notifyDoctorOfVerificationDecision(input.providerId, input.action);
  }

  return result;
}

const NOTIFICATION_FOR_ACTION: Partial<
  Record<
    VerificationAction,
    {
      type: "VERIFICATION_APPROVED" | "VERIFICATION_REJECTED" | "VERIFICATION_SUSPENDED";
      title: string;
      message: string;
    }
  >
> = {
  APPROVE: {
    type: "VERIFICATION_APPROVED",
    title: "Verification approved",
    message:
      "Your provider verification has been approved. You're now visible to patients for booking.",
  },
  REJECT: {
    type: "VERIFICATION_REJECTED",
    title: "Verification rejected",
    message:
      "Your provider verification application was not approved. Contact support for details.",
  },
  SUSPEND: {
    type: "VERIFICATION_SUSPENDED",
    title: "Account suspended",
    message: "Your provider account has been suspended. Contact support for details.",
  },
};

async function notifyDoctorOfVerificationDecision(
  doctorId: string,
  action: VerificationAction,
): Promise<void> {
  const config = NOTIFICATION_FOR_ACTION[action];
  if (!config) return;

  const [doctor] = await db
    .select({ userId: doctors.userId })
    .from(doctors)
    .where(eq(doctors.id, doctorId))
    .limit(1);
  if (!doctor) return;

  await createNotification({
    userId: doctor.userId,
    type: config.type,
    title: config.title,
    message: config.message,
  });
}

/** The permanent decision history for one provider, newest first. */
export async function listProviderVerificationHistory(
  providerType: ProviderType,
  providerId: string,
) {
  return db
    .select()
    .from(providerVerificationEvents)
    .where(eq(providerVerificationEvents.providerId, providerId))
    .orderBy(providerVerificationEvents.createdAt);
}
