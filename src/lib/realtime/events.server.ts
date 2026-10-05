import "@tanstack/react-start/server-only";

import { getRealtimeHub } from "./hub.server";
import type { RealtimeEventInput } from "./types";

/**
 * THE only place business code emits realtime events. Rules:
 *  - call this only AFTER the database write has committed;
 *  - the recipient user id must be derived server-side from database rows
 *    (conversation participants, notification owner) — never from client input;
 *  - it never throws and never blocks the caller: realtime is best-effort
 *    delivery on top of PostgreSQL, so a publish failure must not fail (or
 *    roll back) the real action;
 *  - payloads are opaque ids only — no message text or clinical content.
 */
function publish(userId: string, event: RealtimeEventInput): void {
  try {
    getRealtimeHub().publishToUser(userId, event);
  } catch (error) {
    console.error("[realtime] publish failed (data is safe in PostgreSQL):", error);
  }
}

/** Notifies each participant's own streams that a message exists in this conversation. */
export function publishMessageCreated(params: {
  participantUserIds: string[];
  conversationId: string;
  messageId: string;
}): void {
  for (const userId of new Set(params.participantUserIds)) {
    publish(userId, {
      type: "MESSAGE_CREATED",
      conversationId: params.conversationId,
      messageId: params.messageId,
    });
  }
}

/** Only the reader's OTHER tabs are told — nothing is sent to the other party (no read receipts). */
export function publishConversationRead(userId: string, conversationId: string): void {
  publish(userId, { type: "CONVERSATION_READ", conversationId });
}

export function publishNotificationCreated(userId: string, notificationId: string): void {
  publish(userId, { type: "NOTIFICATION_CREATED", notificationId });
}

export function publishNotificationRead(userId: string, notificationId: string): void {
  publish(userId, { type: "NOTIFICATION_READ", notificationId });
}

export function publishNotificationsReadAll(userId: string): void {
  publish(userId, { type: "NOTIFICATIONS_READ_ALL" });
}

/** Terminates live streams when authorization is withdrawn (logout, suspension, password reset). */
export function revokeRealtimeForSession(sessionId: string, reason: string): void {
  try {
    getRealtimeHub().closeSession(sessionId, reason);
  } catch (error) {
    console.error("[realtime] closeSession failed:", error);
  }
}

export function revokeRealtimeForUser(userId: string, reason: string): void {
  try {
    getRealtimeHub().closeUser(userId, reason);
  } catch (error) {
    console.error("[realtime] closeUser failed:", error);
  }
}
