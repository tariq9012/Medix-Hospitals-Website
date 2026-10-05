import { useEffect, useRef, useSyncExternalStore } from "react";

import {
  REALTIME_STREAM_PATH,
  SSE_EVENT_DATA,
  SSE_EVENT_PING,
  SSE_EVENT_READY,
  SSE_EVENT_SESSION_ENDED,
  isRealtimeEvent,
  type RealtimeEvent,
  type RealtimeEventType,
} from "./types";

/**
 * Browser side of Phase 11 realtime. Client-safe: no server imports.
 *
 * One `RealtimeClient` exists per browser tab. It owns a single
 * EventSource, shared by every component through a ref-count, so navigating
 * (each dashboard page mounts its own <DashboardLayout>) never opens a new
 * connection per render or per page.
 *
 * Events are only "something changed" hints. Consumers must re-fetch through
 * the normal authorized server functions and must tolerate duplicates,
 * reordering and gaps. `resync` fires after every (re)connection because
 * events may have been missed while offline or before the stream registered.
 */

export type RealtimeStatus = "idle" | "connecting" | "connected" | "reconnecting";

export type RealtimeSignal = { kind: "event"; event: RealtimeEvent } | { kind: "resync" };

export interface EventSourceLike {
  addEventListener(type: string, listener: (e: MessageEvent) => void): void;
  close(): void;
  onopen: ((e: Event) => void) | null;
  onerror: ((e: Event) => void) | null;
}

export interface RealtimeClientOptions {
  createEventSource?: (url: string) => EventSourceLike;
  url?: string;
  /** No bytes (incl. heartbeat) for this long => assume a dead connection and reconnect. */
  staleAfterMs?: number;
  watchdogIntervalMs?: number;
  /** How long to keep the stream after the last consumer unmounts (covers page navigation). */
  releaseGraceMs?: number;
  backoff?: { baseMs: number; maxMs: number };
  random?: () => number;
}

const DEFAULTS = {
  staleAfterMs: 70_000, // server heartbeat is 25s
  watchdogIntervalMs: 15_000,
  releaseGraceMs: 5_000,
  backoff: { baseMs: 1_000, maxMs: 30_000 },
};

const SEEN_LIMIT = 200;

export class RealtimeClient {
  private readonly opts: Required<Omit<RealtimeClientOptions, "createEventSource" | "url">> & {
    createEventSource: (url: string) => EventSourceLike;
    url: string;
  };
  private source: EventSourceLike | null = null;
  private refs = 0;
  private status: RealtimeStatus = "idle";
  private ended = false; // server said the session is over: don't reconnect
  private everConnected = false;
  private attempts = 0;
  private lastActivity = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private releaseTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private readonly seen = new Set<string>();
  private readonly signalListeners = new Set<(s: RealtimeSignal) => void>();
  private readonly statusListeners = new Set<() => void>();

  constructor(options: RealtimeClientOptions = {}) {
    this.opts = {
      staleAfterMs: options.staleAfterMs ?? DEFAULTS.staleAfterMs,
      watchdogIntervalMs: options.watchdogIntervalMs ?? DEFAULTS.watchdogIntervalMs,
      releaseGraceMs: options.releaseGraceMs ?? DEFAULTS.releaseGraceMs,
      backoff: options.backoff ?? DEFAULTS.backoff,
      random: options.random ?? Math.random,
      url: options.url ?? REALTIME_STREAM_PATH,
      createEventSource:
        options.createEventSource ??
        ((url) => new EventSource(url, { withCredentials: true }) as unknown as EventSourceLike),
    };
  }

  // ---- public API ---------------------------------------------------------

  /** Ref-counted. Returns a release function. */
  acquire(): () => void {
    this.refs += 1;
    if (this.releaseTimer) {
      clearTimeout(this.releaseTimer);
      this.releaseTimer = null;
    }
    // A new consumer after logout/login (or after "session ended") starts fresh.
    if (this.ended) this.ended = false;
    if (!this.source && !this.reconnectTimer) this.connect();

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.refs = Math.max(0, this.refs - 1);
      if (this.refs === 0 && !this.releaseTimer) {
        this.releaseTimer = setTimeout(() => {
          this.releaseTimer = null;
          if (this.refs === 0) this.teardown("idle");
        }, this.opts.releaseGraceMs);
      }
    };
  }

  /** Immediately close and stop reconnecting (used on logout). */
  shutdown(): void {
    this.ended = true;
    this.teardown("idle");
  }

  subscribe(listener: (s: RealtimeSignal) => void): () => void {
    this.signalListeners.add(listener);
    return () => this.signalListeners.delete(listener);
  }

  getStatus = (): RealtimeStatus => this.status;

  subscribeStatus = (listener: () => void): (() => void) => {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  };

  // ---- internals ----------------------------------------------------------

  private setStatus(next: RealtimeStatus) {
    if (this.status === next) return;
    this.status = next;
    for (const l of [...this.statusListeners]) l();
  }

  private emit(signal: RealtimeSignal) {
    for (const l of [...this.signalListeners]) {
      try {
        l(signal);
      } catch (error) {
        console.error("[realtime] listener error:", error);
      }
    }
  }

  private connect() {
    if (this.ended || this.source) return;
    this.setStatus(this.everConnected ? "reconnecting" : "connecting");

    let source: EventSourceLike;
    try {
      source = this.opts.createEventSource(this.opts.url);
    } catch (error) {
      console.error("[realtime] could not open stream:", error);
      this.scheduleReconnect();
      return;
    }
    this.source = source;
    this.lastActivity = Date.now();

    source.onopen = () => {
      if (this.source !== source) return;
      this.lastActivity = Date.now();
    };

    source.addEventListener(SSE_EVENT_READY, () => {
      if (this.source !== source) return;
      this.lastActivity = Date.now();
      this.attempts = 0;
      this.everConnected = true;
      this.setStatus("connected");
      // Every (re)connect tells consumers to revalidate. After a reconnect that
      // covers events missed while offline; after the FIRST connect it covers
      // changes made between the server rendering the page and this stream
      // registering (SSR -> hydrate -> connect). Cost: one extra authoritative
      // fetch per full page load; page-to-page navigation reuses the stream.
      this.emit({ kind: "resync" });
    });

    source.addEventListener(SSE_EVENT_PING, () => {
      if (this.source === source) this.lastActivity = Date.now();
    });

    source.addEventListener(SSE_EVENT_DATA, (message) => {
      if (this.source !== source) return;
      this.lastActivity = Date.now();
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(message.data));
      } catch {
        return; // malformed frame: ignore, never throw into React
      }
      if (!isRealtimeEvent(parsed)) return;
      if (this.seen.has(parsed.id)) return; // duplicate delivery
      this.seen.add(parsed.id);
      if (this.seen.size > SEEN_LIMIT) {
        const first = this.seen.values().next().value;
        if (first !== undefined) this.seen.delete(first);
      }
      this.emit({ kind: "event", event: parsed });
    });

    source.addEventListener(SSE_EVENT_SESSION_ENDED, () => {
      if (this.source !== source) return;
      // The server withdrew authorization (logout / suspension / expiry).
      this.ended = true;
      this.teardown("idle");
    });

    source.onerror = () => {
      if (this.source !== source) return;
      // Native auto-retry is unreliable across auth failures; own it instead.
      this.closeSource();
      this.scheduleReconnect();
    };

    if (!this.watchdog) {
      this.watchdog = setInterval(() => {
        if (this.source && Date.now() - this.lastActivity > this.opts.staleAfterMs) {
          this.closeSource();
          this.scheduleReconnect();
        }
      }, this.opts.watchdogIntervalMs);
    }
  }

  private closeSource() {
    const source = this.source;
    this.source = null;
    if (source) {
      source.onopen = null;
      source.onerror = null;
      try {
        source.close();
      } catch {
        /* ignore */
      }
    }
  }

  private scheduleReconnect() {
    if (this.ended || this.refs === 0 || this.reconnectTimer) {
      if (this.refs === 0 && !this.ended) this.setStatus("idle");
      return;
    }
    this.setStatus(this.everConnected ? "reconnecting" : "connecting");
    const { baseMs, maxMs } = this.opts.backoff;
    const exp = Math.min(maxMs, baseMs * 2 ** Math.min(this.attempts, 10));
    const delay = Math.round(exp / 2 + this.opts.random() * (exp / 2)); // jittered
    this.attempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private teardown(status: RealtimeStatus) {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
    this.closeSource();
    this.attempts = 0;
    this.everConnected = false;
    this.seen.clear();
    this.setStatus(status);
  }
}

// ---- singleton + React hooks --------------------------------------------------

let singleton: RealtimeClient | null = null;

export function getRealtimeClient(): RealtimeClient {
  if (!singleton) singleton = new RealtimeClient();
  return singleton;
}

/** Test seam. */
export function __setRealtimeClientForTests(client: RealtimeClient | null) {
  singleton = client;
}

/** Mount once per dashboard layout; the shared connection outlives page-to-page navigation. */
export function useRealtimeConnection(): RealtimeStatus {
  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;
    return getRealtimeClient().acquire();
  }, []);
  const client = typeof window === "undefined" ? null : getRealtimeClient();
  return useSyncExternalStore(
    (cb) => (client ? client.subscribeStatus(cb) : () => undefined),
    () => (client ? client.getStatus() : "idle"),
    () => "idle" as RealtimeStatus,
  );
}

/**
 * Serializes an async task: bursts collapse into (at most) one trailing run
 * after `delayMs`, and a trigger that arrives while a run is in flight
 * schedules exactly one more run after it. Prevents event storms from
 * turning into request storms.
 */
export function createCoalescer(
  task: () => Promise<unknown> | unknown,
  delayMs = 250,
  retry: { maxAttempts: number; baseMs: number; maxMs: number } = {
    maxAttempts: 6,
    baseMs: 1_000,
    maxMs: 15_000,
  },
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let pending = false;
  let cancelled = false;
  let failures = 0;

  const run = async () => {
    if (cancelled) return;
    if (running) {
      pending = true;
      return;
    }
    running = true;
    let failed = false;
    try {
      await task();
      failures = 0;
    } catch (error) {
      failed = true;
      console.error("[realtime] revalidation failed:", error);
    } finally {
      running = false;
    }
    if (cancelled) return;
    if (failed) {
      // A failed refresh (offline, server restarting, transient 5xx) must not
      // leave the UI stale until some unrelated later event: retry with backoff.
      if (failures < retry.maxAttempts && !retryTimer) {
        const delay = Math.min(retry.maxMs, retry.baseMs * 2 ** failures);
        failures += 1;
        retryTimer = setTimeout(() => {
          retryTimer = null;
          void run();
        }, delay);
      }
    } else if (pending) {
      pending = false;
      trigger();
    }
  };

  function trigger() {
    if (cancelled) return;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, delayMs);
  }

  return {
    trigger,
    cancel() {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (retryTimer) clearTimeout(retryTimer);
      timer = null;
      retryTimer = null;
    },
  };
}

/**
 * Runs `onChange` (coalesced) when a matching realtime event arrives or the
 * stream re-syncs after a reconnect. `onChange` should re-fetch authoritative
 * data; it always sees the latest closure.
 */
export function useRealtimeRevalidate(
  types: readonly RealtimeEventType[],
  onChange: () => Promise<unknown> | unknown,
  options: { conversationId?: string; delayMs?: number } = {},
) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const typesKey = types.join(",");
  const { conversationId, delayMs } = options;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const wanted = new Set(typesKey.split(",") as RealtimeEventType[]);
    const coalescer = createCoalescer(() => onChangeRef.current(), delayMs ?? 250);
    const unsubscribe = getRealtimeClient().subscribe((signal) => {
      if (signal.kind === "resync") return coalescer.trigger();
      const { event } = signal;
      if (!wanted.has(event.type)) return;
      if (conversationId && event.conversationId && event.conversationId !== conversationId) return;
      coalescer.trigger();
    });
    // Coming back online is itself a reason to revalidate (events may have
    // arrived while requests were failing).
    const onOnline = () => coalescer.trigger();
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
      unsubscribe();
      coalescer.cancel();
    };
  }, [typesKey, conversationId, delayMs]);
}
