/**
 * Application-level error reporting utility.
 *
 * This is a small, neutral abstraction around error reporting so the rest of
 * the app (e.g. the root error boundary) doesn't need to know about any
 * particular monitoring provider. During development it simply logs to the
 * console; wire it up to Sentry or another provider when one is adopted.
 */

type ErrorReportOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

export function reportError(
  error: unknown,
  context: Record<string, unknown> = {},
  options: ErrorReportOptions = {},
) {
  if (typeof window === "undefined") return;

  // Loaders and server fns commonly throw a raw Response; String(it) is the
  // opaque "[object Response]", so pull out the status and URL instead.
  const message =
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  // Replace this with a real monitoring provider (e.g. Sentry) when one is
  // configured. Logging keeps error context visible during development.
  console.error("[error-reporting]", message, {
    stack,
    route: window.location.pathname,
    mechanism: options.mechanism ?? "manual",
    handled: options.handled ?? false,
    severity: options.severity ?? "error",
    ...context,
  });
}
