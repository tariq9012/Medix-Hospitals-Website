import "@tanstack/react-start/server-only";

import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { appointments, type Appointment } from "@/db/schema";
import { recordAuthAuditEvent } from "@/lib/auth/audit.server";
import { voidInvoiceForCancelledAppointment } from "@/lib/billing/service.server";
import type { BookAppointmentInput, CancelAppointmentInput } from "@/lib/validation/appointments";

import { findMatchingAvailabilityRule } from "./availability.server";
import { AppointmentError } from "./errors";
import {
  getBookableDoctorById,
  getOwnedPatientAppointment,
  isHospitalValidForDoctor,
} from "./queries.server";
import { canPatientCancelAppointment, isUpcomingAppointment } from "./status";

export { canPatientCancelAppointment, isUpcomingAppointment };

/** Postgres unique-violation error code. */
const UNIQUE_VIOLATION = "23505";

/**
 * Drizzle wraps driver errors in `DrizzleQueryError`, which puts the real
 * Postgres error (with its `code`) under `.cause` rather than on the error
 * itself — so both shapes need checking here.
 */
function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === UNIQUE_VIOLATION) return true;
  if ("cause" in error && error.cause && typeof error.cause === "object" && "code" in error.cause) {
    return error.cause.code === UNIQUE_VIOLATION;
  }
  return false;
}

function toLocalDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function toLocalTimeString(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

/**
 * Books an appointment for the given (already-authenticated) patient. Every
 * meaningful fact about the appointment — the doctor's fee, whether the
 * hospital is really theirs, whether the slot really exists — is re-derived
 * from the database here, never taken from `input` at face value.
 *
 * Double-booking is prevented at the database level: `appointments` has a
 * partial unique index on (doctorId, appointmentDate, startTime) for
 * non-cancelled rows (see `src/db/schema/appointments.ts`). Two concurrent
 * requests for the same slot both pass every check below and both attempt
 * the INSERT — Postgres allows exactly one of them to succeed and rejects
 * the other with a unique-violation, which is caught here and turned into a
 * clear, safe error rather than a 500.
 */
export async function bookAppointment(
  patientUserId: string,
  input: BookAppointmentInput,
): Promise<Appointment> {
  const doctor = await getBookableDoctorById(input.doctorId);
  if (!doctor) {
    throw new AppointmentError("This doctor is not currently available for booking.");
  }

  if (input.hospitalId) {
    const validHospital = await isHospitalValidForDoctor(input.doctorId, input.hospitalId);
    if (!validHospital) {
      throw new AppointmentError("That location isn't associated with this doctor.");
    }
  }

  if (input.appointmentDate < toLocalDateString()) {
    throw new AppointmentError("You can't book an appointment in the past.");
  }

  const rule = await findMatchingAvailabilityRule({
    doctorId: input.doctorId,
    date: input.appointmentDate,
    hospitalId: input.hospitalId,
    consultationType: input.consultationType,
    startTime: input.startTime,
  });
  if (!rule) {
    throw new AppointmentError("That time isn't available. Please choose a different slot.");
  }

  if (input.appointmentDate === toLocalDateString() && input.startTime <= toLocalTimeString()) {
    throw new AppointmentError("That time has already passed today. Please choose a later slot.");
  }

  const [startH, startM] = input.startTime.split(":").map(Number);
  const endMinutes = (startH ?? 0) * 60 + (startM ?? 0) + rule.slotDurationMinutes;
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;

  try {
    const [created] = await db
      .insert(appointments)
      .values({
        patientId: patientUserId,
        doctorId: input.doctorId,
        hospitalId: input.hospitalId,
        appointmentDate: input.appointmentDate,
        startTime: input.startTime,
        endTime,
        consultationType: input.consultationType,
        reasonForVisit: input.reasonForVisit,
        patientNotes: input.patientNotes,
        status: "PENDING",
        // No payment gateway yet — booking always starts unpaid/pending.
        paymentStatus: "PENDING",
        fee: doctor.consultationFee,
      })
      .returning();

    if (!created) throw new AppointmentError("Could not create the appointment. Please try again.");

    await recordAuthAuditEvent({
      actorUserId: patientUserId,
      action: "APPOINTMENT_CREATED",
      entityId: created.id,
      metadata: {
        doctorId: input.doctorId,
        appointmentDate: input.appointmentDate,
        startTime: input.startTime,
      },
    });

    return created;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppointmentError(
        "This slot was just booked by someone else. Please choose another time.",
      );
    }
    throw error;
  }
}

export async function cancelAppointment(
  patientUserId: string,
  input: CancelAppointmentInput,
): Promise<Appointment> {
  const existing = await getOwnedPatientAppointment(patientUserId, input.appointmentId);
  if (!existing) {
    // Same message whether it doesn't exist or belongs to someone else —
    // never confirm which one to an unauthorized caller.
    throw new AppointmentError("Appointment not found.");
  }

  if (!canPatientCancelAppointment(existing)) {
    throw new AppointmentError("This appointment can no longer be cancelled.");
  }

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(appointments)
      .set({
        status: "CANCELLED",
        cancellationReason: input.cancellationReason,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(appointments.id, input.appointmentId),
          eq(appointments.patientId, patientUserId),
          ne(appointments.status, "CANCELLED"),
        ),
      )
      .returning();

    if (!row) {
      // Someone else (or another tab) cancelled it in the moment between our
      // read and this write — treat it the same as "already cancelled".
      throw new AppointmentError("This appointment can no longer be cancelled.");
    }

    // Phase 12: void the invoice if it was never paid (see the documented
    // policy in src/lib/billing/service.server.ts). A patient can only ever
    // cancel a PENDING or CONFIRMED appointment, and invoices only exist
    // once CONFIRMED, so this is a no-op for still-PENDING appointments.
    await voidInvoiceForCancelledAppointment(tx, row.id);

    return row;
  });

  await recordAuthAuditEvent({
    actorUserId: patientUserId,
    action: "APPOINTMENT_CANCELLED",
    entityId: updated.id,
    metadata: { previousStatus: existing.status },
  });

  return updated;
}
