export type ReviewErrorCode =
  | "NOT_FOUND"
  | "NOT_COMPLETED"
  | "ALREADY_REVIEWED"
  | "INVALID_INPUT"
  | "NOT_EDITABLE"
  | "ALREADY_HIDDEN"
  | "NOT_HIDDEN"
  | "FORBIDDEN_ACTION";

/** Safe-to-display domain error (never wraps a raw database error). */
export class ReviewError extends Error {
  readonly code: ReviewErrorCode;
  constructor(code: ReviewErrorCode, message: string) {
    super(message);
    this.name = "ReviewError";
    this.code = code;
  }
}
