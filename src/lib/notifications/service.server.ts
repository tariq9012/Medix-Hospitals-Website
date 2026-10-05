import "@tanstack/react-start/server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { notifications, type Notification } from "@/db/schema";
import type { JsonObject } from "@/db/schema/json";
import { publishNotificationCreated } from "@/lib/realtime/events.server";

export interface CreateNotificationInput {
  userId: string;
  type: Notification["type"];
  title: string;
  message: string;
  metadata?: JsonObject;
}

/**
 * The single place every other module calls to create a notification —
 * nothing else in the codebase should `db.insert(notifications)` directly,
 * so this dedup/safety behavior can't be quietly bypassed.
 *
 * Deliberately swallows its own failures (logs and returns `null` instead
 * of throwing): creating a notification is a best-effort side effect of a
 * real action (a message was sent, an appointment was confirmed, ...) and
 * must never cause that primary action to fail or roll back.
 */
export async function createNotification(
  input: CreateNotificationInput,
): Promise<Notification | null> {
  try {
    let result: Notification | null;
    if (input.type === "NEW_MESSAGE" && input.metadata?.["conversationId"]) {
      result = await upsertUnreadMessageNotification(input);
    } else {
      const [created] = await db.insert(notifications).values(input).returning();
      result = created ?? null;
    }
    // The insert/update above has committed. Every notification type
    // (appointments, records, prescriptions, documents, verification,
    // messages) flows through here, so one call covers them all. The
    // recipient is the notification's own owner, taken from the stored row.
    if (result) publishNotificationCreated(result.userId, result.id);
    return result;
  } catch (error) {
    console.error("[notifications] createNotification failed:", error);
    return null;
  }
}

/**
 * Deduplication policy for NEW_MESSAGE (Phase 10 rule #26): rather than
 * stacking up one notification per message, a rapid burst of messages in
 * the same conversation collapses into a single unread notification for
 * that conversation, refreshed with the latest text/timestamp each time.
 * Once the recipient reads it (or all notifications), the next new
 * message starts a fresh one. This is a deliberately simple policy, not a
 * general-purpose notification-grouping system.
 */
async function upsertUnreadMessageNotification(
  input: CreateNotificationInput,
): Promise<Notification | null> {
  const conversationId = String(input.metadata?.["conversationId"]);

  const [existing] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, input.userId),
        eq(notifications.type, "NEW_MESSAGE"),
        isNull(notifications.readAt),
        sql`${notifications.metadata}->>'conversationId' = ${conversationId}`,
      ),
    )
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(notifications)
      .set({
        title: input.title,
        message: input.message,
        metadata: input.metadata,
        createdAt: new Date(),
      })
      .where(eq(notifications.id, existing.id))
      .returning();
    return updated ?? null;
  }

  const [created] = await db.insert(notifications).values(input).returning();
  return created ?? null;
}
