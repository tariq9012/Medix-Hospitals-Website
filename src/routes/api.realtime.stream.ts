import { createFileRoute } from "@tanstack/react-router";

/**
 * Authenticated Server-Sent-Events stream (Phase 11). All logic lives in
 * `src/lib/realtime/stream.server.ts`; the dynamic import keeps the
 * server-only modules out of the client bundle.
 */
export const Route = createFileRoute("/api/realtime/stream")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { openRealtimeStream } = await import("@/lib/realtime/stream.server");
        return openRealtimeStream(request);
      },
    },
  },
});
