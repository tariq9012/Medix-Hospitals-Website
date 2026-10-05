/**
 * Thrown for expected, user-safe messaging failures (e.g. "You don't have
 * an appointment relationship with this doctor yet"). Anything else thrown
 * from the messaging service layer is unexpected and should be surfaced as
 * a generic failure rather than leaking internals.
 */
export class MessagingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MessagingError";
  }
}
