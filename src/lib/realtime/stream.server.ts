import "@tanstack/react-start/server-only";

import { randomUUID } from "node:crypto";

import { getSessionContext, isSessionStillValid } from "@/lib/auth/session.server";

import { getRealtimeHub, type RealtimeConnection } from "./hub.server";
import {
  SSE_EVENT_DATA,
  SSE_EVENT_PING,
  SSE_EVENT_READY,
  SSE_EVENT_SESSION_ENDED,
  type RealtimeEvent,
} from "./types";

const HEARTBEAT_MS = Number(process.env["REALTIME_HEARTBEAT_MS"] ?? 25_000);
/** Upper bound on how long a revoked/expired session can keep a live stream. */
const SESSION_RECHECK_MS = Number(process.env["REALTIME_SESSION_RECHECK_MS"] ?? 30_000);
/** If the client stops reading, drop it instead of buffering without bound. */
const MAX_QUEUED_CHUNKS = 64;

const encoder = new TextEncoder();

function frame(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Authenticates from the session cookie and, if valid, returns a
 * Server-Sent-Events response bound to that one user. Nothing about identity
 * (user id, role, patient/doctor id) is read from the URL.
 */
export async function openRealtimeStream(request: Request): Promise<Response> {
  // Defense in depth: SameSite=Lax already keeps the cookie off cross-site
  // subresource requests; also refuse anything the browser marks cross-site.
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return new Response(null, { status: 403, headers: NO_STORE });
  }

  const context = await getSessionContext();
  if (!context) {
    return new Response(null, { status: 401, headers: NO_STORE });
  }

  const { user, sessionId } = context;
  const connectionId = randomUUID();
  let cleanup: (reason: string) => void = () => undefined;

  const body = new ReadableStream<Uint8Array>(
    {
      start(controller) {
        let closed = false;
        const handles: {
          heartbeat?: ReturnType<typeof setInterval>;
          recheck?: ReturnType<typeof setInterval>;
          unregister?: () => void;
        } = {};

        const write = (chunk: Uint8Array): boolean => {
          if (closed) return false;
          try {
            if ((controller.desiredSize ?? 0) < -MAX_QUEUED_CHUNKS) return false;
            controller.enqueue(chunk);
            return true;
          } catch {
            return false;
          }
        };

        cleanup = (reason: string) => {
          if (closed) return;
          if (
            reason === "session-invalid" ||
            reason === "logout" ||
            reason === "sessions-revoked" ||
            reason === "account-suspended"
          ) {
            // Tell the browser to STOP reconnecting (its session is gone).
            try {
              controller.enqueue(frame(SSE_EVENT_SESSION_ENDED, { reason }));
            } catch {
              /* stream already unusable */
            }
          }
          closed = true;
          if (handles.heartbeat) clearInterval(handles.heartbeat);
          if (handles.recheck) clearInterval(handles.recheck);
          handles.unregister?.();
          request.signal.removeEventListener("abort", onAbort);
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        };

        const onAbort = () => cleanup("client-disconnected");
        request.signal.addEventListener("abort", onAbort);

        const connection: RealtimeConnection = {
          id: connectionId,
          userId: user.id,
          sessionId,
          send: (event: RealtimeEvent) => write(frame(SSE_EVENT_DATA, event)),
          close: (reason) => cleanup(reason),
        };

        handles.unregister = getRealtimeHub().register(connection);

        // Flush headers immediately (some proxies hold them until the first byte).
        write(encoder.encode("retry: 5000\n\n"));
        write(frame(SSE_EVENT_READY, { connectionId }));

        handles.heartbeat = setInterval(() => {
          if (!write(frame(SSE_EVENT_PING, { t: Date.now() }))) cleanup("write-failed");
        }, HEARTBEAT_MS);

        handles.recheck = setInterval(() => {
          isSessionStillValid(sessionId)
            .then((valid) => {
              if (!valid) cleanup("session-invalid");
            })
            .catch((error) => {
              // DB hiccup: keep the stream; the next tick will re-check.
              console.error("[realtime] session recheck failed:", error);
            });
        }, SESSION_RECHECK_MS);

        // Never keep the process alive just for these timers.
        for (const h of [handles.heartbeat, handles.recheck]) {
          if (h && typeof h === "object" && "unref" in h) h.unref();
        }
      },
      cancel() {
        cleanup("client-cancelled");
      },
    },
    { highWaterMark: MAX_QUEUED_CHUNKS },
  );

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store, no-transform",
      Connection: "keep-alive",
      // Ask nginx-style proxies not to buffer this response.
      "X-Accel-Buffering": "no",
    },
  });
}
