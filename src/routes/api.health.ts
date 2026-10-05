import { createFileRoute } from "@tanstack/react-router";

/**
 * Liveness probe: "the process is up and can answer HTTP". Deliberately does
 * NOT touch the database (a DB outage must not make an orchestrator restart
 * healthy app instances) and returns nothing but a status flag — no version,
 * environment, host or configuration.
 */
const headers = { "content-type": "application/json", "cache-control": "no-store" };

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: () => new Response(JSON.stringify({ status: "ok" }), { status: 200, headers }),
    },
  },
});
