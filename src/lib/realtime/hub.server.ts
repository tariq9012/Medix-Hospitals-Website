import "@tanstack/react-start/server-only";

import { randomUUID } from "node:crypto";

import type { RealtimeEvent, RealtimeEventInput } from "./types";

/**
 * A live server-side stream belonging to exactly one authenticated user and
 * one auth session. Created only by `stream.server.ts` AFTER the session
 * cookie has been validated; identity is never taken from client input.
 */
export interface RealtimeConnection {
  readonly id: string;
  readonly userId: string;
  readonly sessionId: string;
  /** Returns false if the connection is no longer writable. */
  send(event: RealtimeEvent): boolean;
  close(reason: string): void;
}

/**
 * The broker seam. Everything that emits realtime events talks to this
 * interface only (through `events.server.ts`), so the in-memory
 * implementation below can be swapped for a distributed one without touching
 * messaging/notification code.
 *
 * !! SCALING LIMITATION !!
 * `InMemoryRealtimeHub` only delivers to connections held by THIS process.
 * With more than one app instance (containers, serverless replicas, a
 * cluster), an event published on instance A never reaches a browser
 * connected to instance B. Before scaling horizontally, replace it with a
 * broker-backed implementation of this interface (e.g. Redis Pub/Sub keyed
 * `realtime:user:<id>`, or a managed realtime provider). Correctness is not
 * at risk in the meantime, because clients revalidate PostgreSQL on
 * reconnect and the notification bell keeps a low-frequency fallback poll —
 * but live delivery would be partial.
 */
export interface RealtimeHub {
  register(connection: RealtimeConnection): () => void;
  /** Delivers to that user's connections only. Returns how many received it. */
  publishToUser(userId: string, event: RealtimeEventInput): number;
  closeSession(sessionId: string, reason: string): number;
  closeUser(userId: string, reason: string): number;
  stats(): { connections: number; users: number };
}

/** Upper bound of simultaneous streams per user (tabs/devices). Oldest is evicted. */
export const MAX_CONNECTIONS_PER_USER = 10;

let eventCounter = 0;

function makeEvent(input: RealtimeEventInput): RealtimeEvent {
  eventCounter = (eventCounter + 1) % Number.MAX_SAFE_INTEGER;
  return {
    ...input,
    id: `${Date.now().toString(36)}-${eventCounter.toString(36)}-${randomUUID().slice(0, 8)}`,
    timestamp: new Date().toISOString(),
  };
}

export class InMemoryRealtimeHub implements RealtimeHub {
  private readonly byUser = new Map<string, Map<string, RealtimeConnection>>();

  register(connection: RealtimeConnection): () => void {
    let conns = this.byUser.get(connection.userId);
    if (!conns) {
      conns = new Map();
      this.byUser.set(connection.userId, conns);
    }

    // Bound resource use: evict the oldest streams beyond the per-user cap.
    while (conns.size >= MAX_CONNECTIONS_PER_USER) {
      const oldest = conns.values().next().value as RealtimeConnection | undefined;
      if (!oldest) break;
      conns.delete(oldest.id);
      safeClose(oldest, "connection-limit");
    }

    conns.set(connection.id, connection);

    return () => {
      const current = this.byUser.get(connection.userId);
      if (!current) return;
      current.delete(connection.id);
      if (current.size === 0) this.byUser.delete(connection.userId);
    };
  }

  publishToUser(userId: string, input: RealtimeEventInput): number {
    const conns = this.byUser.get(userId);
    if (!conns || conns.size === 0) return 0;

    const event = makeEvent(input);
    let delivered = 0;
    for (const conn of [...conns.values()]) {
      let ok = false;
      try {
        ok = conn.send(event);
      } catch {
        ok = false;
      }
      if (ok) {
        delivered += 1;
      } else {
        // Dead/slow connection: drop it. The browser reconnects and revalidates.
        conns.delete(conn.id);
        safeClose(conn, "send-failed");
      }
    }
    if (conns.size === 0) this.byUser.delete(userId);
    return delivered;
  }

  closeSession(sessionId: string, reason: string): number {
    let closed = 0;
    for (const conns of this.byUser.values()) {
      for (const conn of [...conns.values()]) {
        if (conn.sessionId === sessionId) {
          safeClose(conn, reason);
          closed += 1;
        }
      }
    }
    return closed;
  }

  closeUser(userId: string, reason: string): number {
    const conns = this.byUser.get(userId);
    if (!conns) return 0;
    const list = [...conns.values()];
    for (const conn of list) safeClose(conn, reason);
    return list.length;
  }

  stats() {
    let connections = 0;
    for (const conns of this.byUser.values()) connections += conns.size;
    return { connections, users: this.byUser.size };
  }
}

function safeClose(conn: RealtimeConnection, reason: string) {
  try {
    conn.close(reason);
  } catch {
    // Already closed — nothing to do.
  }
}

// Anchored on globalThis so dev-server module reloads and duplicated bundle
// chunks can never give the route handler and the publishers two different hubs.
const HUB_KEY = Symbol.for("medix.realtime.hub");
type GlobalWithHub = typeof globalThis & { [HUB_KEY]?: RealtimeHub };

export function getRealtimeHub(): RealtimeHub {
  const g = globalThis as GlobalWithHub;
  if (!g[HUB_KEY]) g[HUB_KEY] = new InMemoryRealtimeHub();
  return g[HUB_KEY];
}
