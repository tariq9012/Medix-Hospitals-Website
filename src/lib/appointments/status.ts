import type { Appointment } from "@/db/schema";

/**
 * Plain, side-effect-free rules about appointment status/timing — safe to
 * import from client components (for showing/hiding UI affordances) AND
 * from the server-only service layer (for actually enforcing them). Keeping
 * them here in one place means the "can I cancel this?" answer the patient
 * sees in the UI can never drift from what the server actually allows.
 */

function todayLocalDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function nowLocalTimeString(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

/** True while an appointment is still ahead of the current local date/time. */
export function isUpcomingAppointment(
  appointment: Pick<Appointment, "appointmentDate" | "startTime">,
): boolean {
  const today = todayLocalDateString();
  if (appointment.appointmentDate > today) return true;
  if (appointment.appointmentDate < today) return false;
  return appointment.startTime.slice(0, 5) > nowLocalTimeString();
}

/** "NO_SHOW" -> "No show", "CONFIRMED" -> "Confirmed" — for display only. */
export function formatStatusLabel(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");
}

/** Centralized rule for whether a patient may cancel — the server re-checks this itself before writing. */
export function canPatientCancelAppointment(
  appointment: Pick<Appointment, "status" | "appointmentDate" | "startTime">,
): boolean {
  if (
    appointment.status === "CANCELLED" ||
    appointment.status === "COMPLETED" ||
    appointment.status === "NO_SHOW"
  ) {
    return false;
  }
  return isUpcomingAppointment(appointment);
}
