import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";

import {
  RealtimeClient,
  createCoalescer,
  type EventSourceLike,
  type RealtimeSignal,
} from "../../src/lib/realtime/client";
import { mergeLatestPage } from "../../src/lib/messaging/merge";
import type { Message } from "../../src/db/schema";

class FakeES implements EventSourceLike {
  static instances: FakeES[] = [];
  onopen: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  closed = false;
  private handlers = new Map<string, Array<(e: MessageEvent) => void>>();
  constructor(public url: string) {
    FakeES.instances.push(this);
  }
  addEventListener(t: string, l: (e: MessageEvent) => void) {
    this.handlers.set(t, [...(this.handlers.get(t) ?? []), l]);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data: unknown) {
    for (const h of this.handlers.get(type) ?? [])
      h({ data: typeof data === "string" ? data : JSON.stringify(data) } as MessageEvent);
  }
  ready() {
    this.emit("ready", { connectionId: "x" });
  }
}
const ev = (id: string, type = "MESSAGE_CREATED") => ({
  id,
  type,
  timestamp: new Date().toISOString(),
  conversationId: "c1",
});
const last = () => FakeES.instances.at(-1)!;

function makeClient(over = {}) {
  return new RealtimeClient({
    createEventSource: (u) => new FakeES(u),
    random: () => 1, // deterministic: full delay
    backoff: { baseMs: 1000, maxMs: 8000 },
    releaseGraceMs: 5000,
    staleAfterMs: 60_000,
    watchdogIntervalMs: 10_000,
    ...over,
  });
}

beforeEach(() => {
  FakeES.instances = [];
  mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"] });
});
afterEach(() => mock.timers.reset());

describe("RealtimeClient connection lifecycle", () => {
  it("opens exactly ONE stream no matter how many consumers acquire it", () => {
    const c = makeClient();
    const r1 = c.acquire();
    const r2 = c.acquire();
    const r3 = c.acquire();
    assert.equal(FakeES.instances.length, 1);
    r1();
    r2();
    r3();
    c.shutdown();
  });

  it("survives page-to-page navigation (release then re-acquire inside the grace window)", () => {
    const c = makeClient();
    const release = c.acquire();
    last().ready();
    release(); // old page unmounts
    mock.timers.tick(1000);
    const release2 = c.acquire(); // new page mounts
    assert.equal(FakeES.instances.length, 1, "no new connection created");
    assert.equal(last().closed, false);
    // Well past the 5s grace window, with normal server heartbeats arriving.
    for (let i = 0; i < 6; i++) {
      mock.timers.tick(2000);
      last().emit("ping", {});
    }
    assert.equal(FakeES.instances.length, 1);
    assert.equal(last().closed, false, "grace timer must have been cancelled");
    release2();
    c.shutdown();
  });

  it("closes after the last consumer leaves and the grace period passes", () => {
    const c = makeClient();
    const release = c.acquire();
    last().ready();
    release();
    mock.timers.tick(5001);
    assert.equal(last().closed, true);
    assert.equal(c.getStatus(), "idle");
  });

  it("shutdown() (logout) closes immediately and does not reconnect", () => {
    const c = makeClient();
    c.acquire();
    last().ready();
    c.shutdown();
    assert.equal(last().closed, true);
    mock.timers.tick(120_000);
    assert.equal(FakeES.instances.length, 1);
  });

  it("a new consumer after logout/login starts a fresh connection", () => {
    const c = makeClient();
    c.acquire();
    c.shutdown();
    c.acquire();
    assert.equal(FakeES.instances.length, 2);
    c.shutdown();
  });
});

describe("RealtimeClient events", () => {
  it("delivers events, ignores duplicates, malformed frames and unknown types", () => {
    const c = makeClient();
    const got: RealtimeSignal[] = [];
    c.subscribe((s) => got.push(s));
    c.acquire();
    last().ready();
    last().emit("realtime", ev("e1"));
    last().emit("realtime", ev("e1")); // duplicate
    last().emit("realtime", "{not json");
    last().emit("realtime", { id: "e2", type: "TOTALLY_UNKNOWN", timestamp: "t" });
    last().emit("realtime", { nope: true });
    last().emit("realtime", ev("e3", "NOTIFICATION_CREATED"));
    assert.deepEqual(
      got.map((s) => (s.kind === "event" ? s.event.id : s.kind)),
      ["resync", "e1", "e3"],
    );
    c.shutdown();
  });

  it("a throwing listener can't break other listeners", () => {
    const c = makeClient();
    const got: string[] = [];
    mock.method(console, "error", () => undefined);
    c.subscribe(() => {
      throw new Error("bad consumer");
    });
    c.subscribe((s) => got.push(s.kind));
    c.acquire();
    last().ready();
    last().emit("realtime", ev("e1"));
    assert.deepEqual(got, ["resync", "event"]);
    c.shutdown();
  });
});

describe("RealtimeClient reconnect", () => {
  it("EVERY connect emits resync (first: covers SSR->connect gap; later: covers offline gap)", () => {
    const c = makeClient();
    const kinds: string[] = [];
    c.subscribe((s) => kinds.push(s.kind));
    c.acquire();
    last().ready();
    assert.deepEqual(kinds, ["resync"]);
    last().onerror?.(new Event("error"));
    assert.equal(c.getStatus(), "reconnecting");
    mock.timers.tick(1000);
    assert.equal(FakeES.instances.length, 2);
    last().ready();
    assert.deepEqual(kinds, ["resync", "resync"]);
    assert.equal(c.getStatus(), "connected");
    c.shutdown();
  });

  it("page-to-page navigation reuses the stream and does NOT resync again", () => {
    const c = makeClient();
    const kinds: string[] = [];
    c.subscribe((s) => kinds.push(s.kind));
    const r1 = c.acquire();
    last().ready();
    r1();
    mock.timers.tick(500);
    c.acquire();
    assert.equal(FakeES.instances.length, 1);
    assert.deepEqual(kinds, ["resync"]);
    c.shutdown();
  });

  it("backs off exponentially with a cap, and resets after a successful connect", () => {
    const c = makeClient();
    c.acquire();
    const delays: number[] = [];
    for (let i = 0; i < 6; i++) {
      const before = FakeES.instances.length;
      last().onerror?.(new Event("error"));
      let waited = 0;
      while (FakeES.instances.length === before && waited < 20_000) {
        mock.timers.tick(250);
        waited += 250;
      }
      delays.push(waited);
    }
    assert.deepEqual(delays, [1000, 2000, 4000, 8000, 8000, 8000]);
    last().ready();
    last().onerror?.(new Event("error"));
    mock.timers.tick(1000);
    assert.equal(FakeES.instances.length, 8, "backoff reset to base after success");
    c.shutdown();
  });

  it("does not stack multiple reconnect timers on repeated errors", () => {
    const c = makeClient();
    c.acquire();
    const src = last();
    src.onerror?.(new Event("error"));
    src.onerror?.(new Event("error"));
    src.onerror?.(new Event("error"));
    mock.timers.tick(1000);
    assert.equal(FakeES.instances.length, 2);
    c.shutdown();
  });

  it("session-ended from the server stops reconnecting for good", () => {
    const c = makeClient();
    c.acquire();
    last().ready();
    last().emit("session-ended", { reason: "logout" });
    assert.equal(last().closed, true);
    mock.timers.tick(300_000);
    assert.equal(FakeES.instances.length, 1);
    assert.equal(c.getStatus(), "idle");
  });

  it("watchdog reconnects a silently dead connection, but heartbeats keep a healthy one", () => {
    const c = makeClient();
    c.acquire();
    last().ready();
    for (let i = 0; i < 6; i++) {
      mock.timers.tick(25_000);
      last().emit("ping", {});
    }
    assert.equal(FakeES.instances.length, 1, "heartbeats keep it alive");
    mock.timers.tick(75_000); // silence
    assert.equal(FakeES.instances[0]!.closed, true);
    mock.timers.tick(2000);
    assert.equal(FakeES.instances.length, 2);
    c.shutdown();
  });

  it("ignores late callbacks from a superseded connection", () => {
    const c = makeClient();
    const got: string[] = [];
    c.subscribe((s) => got.push(s.kind));
    c.acquire();
    const old = last();
    old.ready();
    old.onerror?.(new Event("error"));
    mock.timers.tick(1000);
    const fresh = last();
    fresh.ready();
    old.emit("realtime", ev("stale"));
    assert.deepEqual(got, ["resync", "resync"]);
    c.shutdown();
  });
});

describe("createCoalescer (no event storms)", () => {
  it("collapses a burst into one run", async () => {
    let runs = 0;
    const co = createCoalescer(() => {
      runs++;
    }, 200);
    for (let i = 0; i < 50; i++) co.trigger();
    mock.timers.tick(200);
    await Promise.resolve();
    assert.equal(runs, 1);
    co.cancel();
  });

  it("a trigger during an in-flight run schedules exactly one follow-up (serialized)", async () => {
    let runs = 0;
    let concurrent = 0;
    let maxConcurrent = 0;
    let release!: () => void;
    const co = createCoalescer(async () => {
      runs++;
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise<void>((r) => (release = r));
      concurrent--;
    }, 100);
    co.trigger();
    mock.timers.tick(100);
    await Promise.resolve();
    for (let i = 0; i < 10; i++) co.trigger(); // events arrive mid-flight
    mock.timers.tick(100);
    await Promise.resolve();
    assert.equal(runs, 1, "no overlapping run started");
    release();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    mock.timers.tick(100);
    await Promise.resolve();
    assert.equal(runs, 2, "exactly one follow-up");
    release?.();
    assert.equal(maxConcurrent, 1);
    co.cancel();
  });

  it("a failing task is RETRIED with backoff (no stale UI after a transient failure), then stops retrying on success", async () => {
    mock.method(console, "error", () => undefined);
    let runs = 0;
    const co = createCoalescer(() => {
      runs++;
      if (runs < 3) throw new Error("offline");
    }, 50);
    co.trigger();
    mock.timers.tick(50);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(runs, 1);
    mock.timers.tick(1000);
    await Promise.resolve();
    await Promise.resolve(); // retry #1 (1s)
    assert.equal(runs, 2);
    mock.timers.tick(2000);
    await Promise.resolve();
    await Promise.resolve(); // retry #2 (2s) succeeds
    assert.equal(runs, 3);
    mock.timers.tick(60_000);
    await Promise.resolve();
    assert.equal(runs, 3, "no further runs after success");
    co.cancel();
  });

  it("gives up after maxAttempts so a permanently failing task can't loop forever", async () => {
    mock.method(console, "error", () => undefined);
    let runs = 0;
    const co = createCoalescer(
      () => {
        runs++;
        throw new Error("down");
      },
      10,
      { maxAttempts: 3, baseMs: 100, maxMs: 1000 },
    );
    co.trigger();
    for (let i = 0; i < 40; i++) {
      mock.timers.tick(1000);
      await Promise.resolve();
      await Promise.resolve();
    }
    assert.equal(runs, 4, "1 initial + 3 retries, then stop");
    co.cancel();
  });
});

describe("mergeLatestPage (dedupe + ordering)", () => {
  const m = (id: string, ms: number, body = id): Message =>
    ({
      id,
      conversationId: "c",
      senderId: "u",
      body,
      readAt: null,
      createdAt: new Date(ms),
    }) as Message;

  it("never duplicates a message already on screen", () => {
    const merged = mergeLatestPage([m("1", 1), m("2", 2)], [m("1", 1), m("2", 2), m("3", 3)]);
    assert.deepEqual(
      merged.map((x) => x.id),
      ["1", "2", "3"],
    );
  });
  it("keeps older pages already loaded, in order", () => {
    const merged = mergeLatestPage([m("0", 0), m("1", 1), m("2", 2)], [m("2", 2), m("3", 3)]);
    assert.deepEqual(
      merged.map((x) => x.id),
      ["0", "1", "2", "3"],
    );
  });
  it("preserves the SERVER's order for same-millisecond messages (no client re-sort)", () => {
    const merged = mergeLatestPage([], [m("b", 5), m("a", 5), m("c", 5)]);
    assert.deepEqual(
      merged.map((x) => x.id),
      ["b", "a", "c"],
    );
  });
  it("replaces an optimistic/stale copy with the authoritative row", () => {
    const merged = mergeLatestPage(
      [{ ...m("1", 1), readAt: null } as Message],
      [{ ...m("1", 1), readAt: new Date(9) } as Message],
    );
    assert.ok(merged[0]!.readAt);
  });
  it("a STALE response can't drop a newer message an earlier, fresher response already delivered", () => {
    const onScreen = [m("1", 1), m("2", 2), m("3", 3)]; // 3 came from the fresher response
    const staleLatest = [m("1", 1), m("2", 2)]; // older request finishing late
    assert.deepEqual(
      mergeLatestPage(onScreen, staleLatest).map((x) => x.id),
      ["1", "2", "3"],
    );
  });
  it("empty authoritative page leaves the view untouched", () => {
    const prev = [m("1", 1)];
    assert.equal(mergeLatestPage(prev, []), prev);
  });
});
