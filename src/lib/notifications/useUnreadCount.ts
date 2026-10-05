import { useEffect, useState } from "react";

import { createCoalescer, getRealtimeClient, useRealtimeConnection } from "@/lib/realtime/client";
import { countMyUnreadNotificationsFn } from "@/lib/notifications/functions";

/**
 * Unread-notification count for the header bell.
 *
 * Phase 11: the count is refreshed when a realtime NOTIFICATION_* hint
 * arrives (or the stream re-syncs after a reconnect). PostgreSQL stays the
 * source of truth — the event only triggers the same count query as before.
 *
 * Polling remains purely as a fallback, at two speeds:
 *  - realtime connected: a rare safety-net poll (events are best-effort);
 *  - realtime not connected: the Phase 10 45s cadence, so the bell still
 *    works if the stream is blocked/unavailable.
 */
const FALLBACK_POLL_MS = 45_000;
const SAFETY_POLL_MS = 5 * 60_000;

const NOTIFICATION_EVENT_TYPES = new Set([
  "NOTIFICATION_CREATED",
  "NOTIFICATION_READ",
  "NOTIFICATIONS_READ_ALL",
]);

export function useUnreadNotificationCount(): number {
  const [count, setCount] = useState(0);
  const status = useRealtimeConnection();
  const connected = status === "connected";

  // Event-driven refresh (coalesced so bursts become one query).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const coalescer = createCoalescer(async () => {
      const value = await countMyUnreadNotificationsFn();
      setCount(value);
    }, 150);
    const unsubscribe = getRealtimeClient().subscribe((signal) => {
      if (signal.kind === "resync" || NOTIFICATION_EVENT_TYPES.has(signal.event.type)) {
        coalescer.trigger();
      }
    });
    return () => {
      unsubscribe();
      coalescer.cancel();
    };
  }, []);

  // Initial load + fallback/safety polling (interval depends on connection health).
  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const value = await countMyUnreadNotificationsFn();
        if (!cancelled) setCount(value);
      } catch {
        // Silent — a failed poll just leaves the previous count showing.
      }
    }

    refresh();
    const interval = setInterval(refresh, connected ? SAFETY_POLL_MS : FALLBACK_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [connected]);

  return count;
}
