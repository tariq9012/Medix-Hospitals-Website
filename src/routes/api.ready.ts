import { createFileRoute } from "@tanstack/react-router";

/**
 * Readiness probe: valid configuration + a working PostgreSQL connection.
 * 200 {"status":"ok"} or 503 {"status":"unavailable"} — never connection
 * strings, error text, stack traces or versions (those are logged
 * server-side only, with SQL parameters redacted).
 */
const headers = { "content-type": "application/json", "cache-control": "no-store" };

export const Route = createFileRoute("/api/ready")({
  server: {
    handlers: {
      GET: async () => {
        const { checkReadiness } = await import("@/lib/health.server");
        const { ready } = await checkReadiness();
        return new Response(JSON.stringify({ status: ready ? "ok" : "unavailable" }), {
          status: ready ? 200 : 503,
          headers,
        });
      },
    },
  },
});
