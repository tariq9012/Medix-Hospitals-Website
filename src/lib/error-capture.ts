// Captures the original Error out-of-band so server.ts can recover the stack
// when h3 has already swallowed the throw into a generic 500 Response.

let lastCapturedError: { error: unknown; at: number } | undefined;
const TTL_MS = 5_000;

function record(error: unknown) {
  lastCapturedError = { error, at: Date.now() };
}

// h3's HTTPError serializes to {"status":500,"unhandled":true,"message":"HTTPError"} —
// no stack, no cause — so a plain console.error(error) reaches the log pipeline with
// the failure detail stripped. Expand Error-like args into a string that keeps the
// message, stack, and the full cause chain.
const CAUSE_DEPTH_LIMIT = 5;
const DESCRIPTION_LENGTH_LIMIT = 8_000;

/**
 * Drizzle's DrizzleQueryError embeds the SQL *and its bound parameters* in
 * the error message ("Failed query: insert … \nparams: <values>"). Those
 * values can be private message bodies, clinical text, e-mail addresses or
 * token hashes, and a failed insert would otherwise write them straight into
 * the logs. We keep the SQL text, error type and stack (everything needed to
 * debug) and replace only the parameter values.
 *
 * Set MEDIX_LOG_SQL_PARAMS=1 to keep parameters for LOCAL debugging; the
 * flag is ignored when NODE_ENV=production.
 */
export function redactQueryParams(message: string): string {
  const keep =
    process.env["MEDIX_LOG_SQL_PARAMS"] === "1" && process.env["NODE_ENV"] !== "production";
  if (keep) return message;
  const at = message.indexOf("\nparams:");
  if (at === -1) return message;
  return `${message.slice(0, at)}\nparams: [redacted]`;
}

export function describeError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < CAUSE_DEPTH_LIMIT && current != null; depth++) {
    if (!(current instanceof Error)) {
      parts.push(typeof current === "string" ? current : safeStringify(current));
      break;
    }
    const label = depth === 0 ? "" : "caused by: ";
    const status = describeStatus(current);
    // Rebuild "<name>: <message>" with redaction, then re-attach the original stack frames.
    const stack = current.stack ?? "";
    const framesAt = stack.indexOf("\n    at ");
    const frames = framesAt === -1 ? "" : stack.slice(framesAt);
    const header = redactQueryParams(`${current.name}: ${current.message}`);
    parts.push(`${label}${header}${frames}${status}`);
    current = current.cause;
  }
  return parts.join("\n").slice(0, DESCRIPTION_LENGTH_LIMIT);
}

function describeStatus(error: Error): string {
  const { status, statusCode } = error as { status?: unknown; statusCode?: unknown };
  const value = status ?? statusCode;
  return typeof value === "number" ? ` (status ${value})` : "";
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function isErrorLike(value: unknown): value is Error {
  return value instanceof Error;
}

// Wrap console.error so errors logged by any layer — including h3's internal
// unhandled-error logging, which this file cannot hook directly — are both
// recorded for consumeLastCapturedError and expanded before serialization.
const originalConsoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  const expanded = args.map((arg) => {
    if (!isErrorLike(arg)) return arg;
    record(arg);
    return describeError(arg);
  });
  originalConsoleError(...expanded);
};

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("error", (event) => record((event as ErrorEvent).error ?? event));
  globalThis.addEventListener("unhandledrejection", (event) =>
    record((event as PromiseRejectionEvent).reason),
  );
}

export function consumeLastCapturedError(): unknown {
  if (!lastCapturedError) return undefined;
  if (Date.now() - lastCapturedError.at > TTL_MS) {
    lastCapturedError = undefined;
    return undefined;
  }
  const { error } = lastCapturedError;
  lastCapturedError = undefined;
  return error;
}
