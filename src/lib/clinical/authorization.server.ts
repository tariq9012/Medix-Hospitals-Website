import "@tanstack/react-start/server-only";

import type { Appointment } from "@/db/schema";
import { getOwnedDoctorAppointment } from "@/lib/doctor/queries.server";

import { ClinicalError } from "./errors";

/**
 * The single centralized authorization check for "may this doctor create
 * clinical data against this appointment right now?" Every clinical
 * creation path (medical records, prescriptions) MUST go through this —
 * there is no other place in the codebase that's allowed to grant that
 * authority.
 *
 * `doctorId` must already be the caller's own resolved doctor id (from
 * `requireVerifiedDoctorRecord()`), never a client-supplied value.
 *
 * Reuses `getOwnedDoctorAppointment`, which bakes the ownership check into
 * the query itself: a mismatched appointment/doctor pair returns `null`
 * exactly like a nonexistent appointment would, so a doctor probing another
 * doctor's appointment id learns nothing beyond "not found or not yours".
 */
export async function requireCompletedOwnedAppointment(
  doctorId: string,
  appointmentId: string,
): Promise<Appointment & { patientId: string; hospitalId: string | null }> {
  const appointment = await getOwnedDoctorAppointment(doctorId, appointmentId);
  if (!appointment) {
    throw new ClinicalError("Appointment not found.");
  }
  if (appointment.status !== "COMPLETED") {
    throw new ClinicalError(
      "A medical record or prescription can only be created for a completed appointment.",
    );
  }
  return appointment;
}
