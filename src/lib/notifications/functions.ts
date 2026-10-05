import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireUser } from "@/lib/auth/authorization.server";
import { recordAuthAuditEvent } from "@/lib/auth/audit.server";
import { publishNotificationRead, publishNotificationsReadAll } from "@/lib/realtime/events.server";
import { idSchema } from "@/lib/validation/common";

import {
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./queries.server";

/**
 * Same client-safe boundary pattern as every other `functions.ts` module:
 * identity always comes from `requireUser()` (the session), never from
 * client input — there is no way to pass a `userId` into any of these.
 */

export const listMyNotificationsFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  try {
    return await listNotifications(user.id);
  } catch (error) {
    console.error("[notifications] listMyNotificationsFn failed:", error);
    return [];
  }
});

export const countMyUnreadNotificationsFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  try {
    return await countUnreadNotifications(user.id);
  } catch (error) {
    console.error("[notifications] countMyUnreadNotificationsFn failed:", error);
    return 0;
  }
});

export const markNotificationReadFn = createServerFn({ method: "POST" })
  .validator(z.object({ notificationId: idSchema }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    try {
      const ok = await markNotificationRead(user.id, data.notificationId);
      // Committed: sync this user's other tabs.
      if (ok) publishNotificationRead(user.id, data.notificationId);
      return { ok };
    } catch (error) {
      console.error("[notifications] markNotificationReadFn failed:", error);
      return { ok: false };
    }
  });

export const markAllNotificationsReadFn = createServerFn({ method: "POST" }).handler(async () => {
  const user = await requireUser();
  try {
    const count = await markAllNotificationsRead(user.id);
    if (count > 0) {
      publishNotificationsReadAll(user.id);
      await recordAuthAuditEvent({
        actorUserId: user.id,
        action: "NOTIFICATIONS_MARKED_READ",
        entityType: "notification",
        metadata: { count },
      });
    }
    return { ok: true, count };
  } catch (error) {
    console.error("[notifications] markAllNotificationsReadFn failed:", error);
    return { ok: false, count: 0 };
  }
});
