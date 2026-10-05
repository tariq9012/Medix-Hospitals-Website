import "@tanstack/react-start/server-only";

import { and, count, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { notifications, type Notification } from "@/db/schema";

/**
 * A page of this user's notifications, newest first. Identity always comes
 * from the caller having already resolved the session — never a
 * browser-supplied `userId`.
 */
export async function listNotifications(userId: string, limit = 30): Promise<Notification[]> {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

/** A single efficient count query — never computed by fetching all rows and counting in JS. */
export async function countUnreadNotifications(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.value ?? 0;
}

/**
 * Marks one notification read, but ONLY if it belongs to the requesting
 * user — ownership is enforced inside the `UPDATE ... WHERE` clause
 * itself, so a user can never mark (or even confirm the existence of)
 * someone else's notification.
 */
export async function markNotificationRead(
  userId: string,
  notificationId: string,
): Promise<boolean> {
  const [updated] = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
      ),
    )
    .returning({ id: notifications.id });
  return Boolean(updated);
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const updated = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return updated.length;
}
