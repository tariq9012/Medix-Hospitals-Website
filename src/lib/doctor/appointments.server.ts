import "@tanstack/react-start/server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { appointments, doctors, type Appointment } from "@/db/schema";
import type { AppointmentStatus } from "@/lib/validation/enums";
import { AppointmentError } from "@/lib/appointments/errors";
import { recordAuthAuditEvent } from "@/lib/auth/audit.server";
import {
  afterInvoiceIssued,
  createInvoiceForAppointment,
  voidInvoiceForCancelledAppointment,
} from "@/lib/billing/service.server";
import type { Invoice } from "@/db/schema";
import { createNotification } from "@/lib/notifications/service.server";
import type { DoctorAppointmentAction } from "@/lib/validation/doctor";

import { getOwnedDoctorAppointment } from "./queries.server";

/**
 * The single source of truth for which doctor-initiated status transitions
 * are legal. Anything not listed here is rejected — there is no "any status
 * to any status" escape hatch anywhere in this module. Kept consistent with
 * the patient-side rules in `src/lib/appointments/status.ts` (patients may
 * only ever reach CANCELLED; everything else is doctor-only).
 */
const TRANSITION_MATRIX: Record<
  DoctorAppointmentAction,
  { from: AppointmentStatus[]; to: AppointmentStatus }
> = {
  CONFIRM: { from: ["PENDING"], to: "CONFIRMED" },
  COMPLETE: { from: ["CONFIRMED"], to: "COMPLETED" },
  NO_SHOW: { from: ["CONFIRMED"], to: "NO_SHOW" },
  CANCEL: { from: ["PENDING", "CONFIRMED"], to: "CANCELLED" },
};

const AUDIT_ACTION_FOR_TRANSITION = {
  CONFIRM: "DOCTOR_APPOINTMENT_CONFIRMED",
  COMPLETE: "DOCTOR_APPOINTMENT_COMPLETED",
  NO_SHOW: "DOCTOR_APPOINTMENT_NO_SHOW",
  CANCEL: "DOCTOR_APPOINTMENT_CANCELLED",
} as const;

function toLocalDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function toLocalTimeString(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

/** True once the appointment's scheduled start has actually arrived (same wall-clock convention as Phase 4). */
function hasAppointmentTimeArrived(
  appointment: Pick<Appointment, "appointmentDate" | "startTime">,
): boolean {
  const today = toLocalDateString();
  if (appointment.appointmentDate < today) return true;
  if (appointment.appointmentDate > today) return false;
  return appointment.startTime.slice(0, 5) <= toLocalTimeString();
}

/**
 * Applies a doctor-initiated status change. Ownership (`doctorId`) always
 * comes from `requireDoctorRecord()` at the call site, never the client.
 * The final `UPDATE` includes the previously-read status as a guard, so a
 * concurrent transition (e.g. the same appointment updated from another
 * tab) can't silently overwrite itself — it fails cleanly instead.
 */
export async function applyDoctorAppointmentAction(
  doctorId: string,
  actorUserId: string,
  input: { appointmentId: string; action: DoctorAppointmentAction; cancellationReason?: string },
): Promise<Appointment> {
  const existing = await getOwnedDoctorAppointment(doctorId, input.appointmentId);
  if (!existing) {
    throw new AppointmentError("Appointment not found.");
  }

  const rule = TRANSITION_MATRIX[input.action];
  if (!rule.from.includes(existing.status)) {
    throw new AppointmentError(
      `This appointment is ${existing.status.toLowerCase()} and can't be moved to ${rule.to.toLowerCase()}.`,
    );
  }

  if (
    (input.action === "COMPLETE" || input.action === "NO_SHOW") &&
    !hasAppointmentTimeArrived(existing)
  ) {
    throw new AppointmentError(
      "This appointment hasn't happened yet — it can only be marked complete or no-show once its scheduled time has arrived.",
    );
  }

  if (input.action === "CANCEL" && !input.cancellationReason) {
    throw new AppointmentError("A cancellation reason is required.");
  }

  // CONFIRM and CANCEL have billing side effects (Phase 12): invoice
  // creation and, for cancellations, invoice voiding. Both happen in the
  // SAME transaction as the status update, so an invoice can never exist
  // without its appointment truly being confirmed (or vice versa).
  let issuedInvoice: Invoice | null = null;
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(appointments)
      .set({
        status: rule.to,
        cancellationReason:
          input.action === "CANCEL" ? input.cancellationReason : existing.cancellationReason,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(appointments.id, input.appointmentId),
          eq(appointments.doctorId, doctorId),
          eq(appointments.status, existing.status),
        ),
      )
      .returning();

    if (!row) {
      throw new AppointmentError(
        "This appointment was just updated elsewhere. Please refresh and try again.",
      );
    }

    if (input.action === "CONFIRM") {
      issuedInvoice = await createInvoiceForAppointment(tx, {
        id: row.id,
        patientId: row.patientId,
        doctorId: row.doctorId,
        hospitalId: row.hospitalId,
        fee: row.fee,
      });
    } else if (input.action === "CANCEL") {
      await voidInvoiceForCancelledAppointment(tx, row.id);
    }

    return row;
  });

  await recordAuthAuditEvent({
    actorUserId,
    action: AUDIT_ACTION_FOR_TRANSITION[input.action],
    entityId: updated.id,
    metadata: { previousStatus: existing.status, newStatus: updated.status },
  });

  // Best-effort patient notification for the transitions that genuinely
  // matter to them. A notification failure never affects the appointment
  // update itself (already committed above) — createNotification swallows
  // its own errors.
  await notifyPatientOfStatusChange(updated, input.action);
  if (issuedInvoice) await afterInvoiceIssued(issuedInvoice, actorUserId);

  return updated;
}

const NOTIFICATION_FOR_TRANSITION: Partial<
  Record<
    DoctorAppointmentAction,
    {
      type: "APPOINTMENT_CONFIRMED" | "APPOINTMENT_CANCELLED" | "APPOINTMENT_COMPLETED";
      title: string;
    }
  >
> = {
  CONFIRM: { type: "APPOINTMENT_CONFIRMED", title: "Appointment confirmed" },
  CANCEL: { type: "APPOINTMENT_CANCELLED", title: "Appointment cancelled" },
  COMPLETE: { type: "APPOINTMENT_COMPLETED", title: "Appointment completed" },
  // NO_SHOW deliberately has no patient notification — it isn't a useful
  // or kind thing to surface as a push-style alert.
};

async function notifyPatientOfStatusChange(
  appointment: Appointment,
  action: DoctorAppointmentAction,
): Promise<void> {
  const config = NOTIFICATION_FOR_TRANSITION[action];
  if (!config) return;

  const [doctor] = await db
    .select({ firstName: doctors.firstName, lastName: doctors.lastName })
    .from(doctors)
    .where(eq(doctors.id, appointment.doctorId))
    .limit(1);
  const doctorLabel = doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : "your doctor";

  const messageByType: Record<string, string> = {
    APPOINTMENT_CONFIRMED: `${doctorLabel} confirmed your appointment on ${appointment.appointmentDate}.`,
    APPOINTMENT_CANCELLED: `${doctorLabel} cancelled your appointment on ${appointment.appointmentDate}.`,
    APPOINTMENT_COMPLETED: `Your appointment with ${doctorLabel} on ${appointment.appointmentDate} is complete.`,
  };

  await createNotification({
    userId: appointment.patientId,
    type: config.type,
    title: config.title,
    message: messageByType[config.type] ?? config.title,
    metadata: { appointmentId: appointment.id, doctorId: appointment.doctorId },
  });
}
