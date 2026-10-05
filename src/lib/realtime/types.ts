/**
 * Realtime event model shared by the server publisher and the browser client.
 * Safe to import from client code: no server-only or database imports here.
 *
 * Events are deliberately tiny INVALIDATION hints, never data. They carry
 * opaque identifiers only (no message bodies, clinical text, names). The
 * browser reacts by re-fetching through the normal, authorized server
 * functions, so PostgreSQL stays the single source of truth and an event is
 * never itself an authorization to see anything.
 */

export const REALTIME_EVENT_TYPES = [
  "MESSAGE_CREATED",
  "CONVERSATION_READ",
  "NOTIFICATION_CREATED",
  "NOTIFICATION_READ",
  "NOTIFICATIONS_READ_ALL",
] as const;

export type RealtimeEventType = (typeof REALTIME_EVENT_TYPES)[number];

export interface RealtimeEvent {
  /** Unique per event; lets the client ignore duplicates. Not a replay cursor. */
  id: string;
  type: RealtimeEventType;
  /** ISO-8601 server timestamp. Informational only; never used for ordering data. */
  timestamp: string;
  conversationId?: string;
  messageId?: string;
  notificationId?: string;
}

export type RealtimeEventInput = Omit<RealtimeEvent, "id" | "timestamp">;

export const REALTIME_STREAM_PATH = "/api/realtime/stream";

/** SSE frame names used on the wire. */
export const SSE_EVENT_DATA = "realtime";
export const SSE_EVENT_READY = "ready";
export const SSE_EVENT_PING = "ping";
export const SSE_EVENT_SESSION_ENDED = "session-ended";

export function isRealtimeEvent(value: unknown): value is RealtimeEvent {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["id"] === "string" &&
    typeof v["timestamp"] === "string" &&
    typeof v["type"] === "string" &&
    (REALTIME_EVENT_TYPES as readonly string[]).includes(v["type"])
  );
}
