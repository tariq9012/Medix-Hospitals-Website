/**
 * Thrown for expected, user-safe appointment-flow failures (e.g. "This slot
 * was just booked by someone else"). Anything else thrown from the service
 * layer is unexpected and should be surfaced as a generic failure.
 */
export class AppointmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppointmentError";
  }
}
