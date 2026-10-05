/**
 * Thrown for expected, user-safe clinical-flow failures (e.g. "This
 * appointment must be completed before a medical record can be created").
 * Anything else thrown from the clinical service layer is unexpected and
 * should be surfaced as a generic failure rather than leaking internals.
 */
export class ClinicalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClinicalError";
  }
}
