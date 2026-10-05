import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  InMemoryRealtimeHub,
  MAX_CONNECTIONS_PER_USER,
  type RealtimeConnection,
} from "../../src/lib/realtime/hub.server";
import type { RealtimeEvent } from "../../src/lib/realtime/types";

function conn(userId: string, sessionId = `s-${userId}`, id = crypto.randomUUID()) {
  const received: RealtimeEvent[] = [];
  const state = { closed: [] as string[], writable: true };
  const c: RealtimeConnection = {
    id,
    userId,
    sessionId,
    send: (e) => {
      if (!state.writable) return false;
      received.push(e);
      return true;
    },
    close: (r) => state.closed.push(r),
  };
  return { c, received, state };
}

describe("InMemoryRealtimeHub recipient scoping", () => {
  it("delivers only to the addressed user, never to anyone else", () => {
    const hub = new InMemoryRealtimeHub();
    const a = conn("patient-a");
    const b = conn("patient-b");
    const doc = conn("doctor-a");
    const admin = conn("hospital-admin");
    for (const x of [a, b, doc, admin]) hub.register(x.c);

    const n = hub.publishToUser("doctor-a", {
      type: "MESSAGE_CREATED",
      conversationId: "c1",
      messageId: "m1",
    });

    assert.equal(n, 1);
    assert.equal(doc.received.length, 1);
    assert.equal(a.received.length, 0);
    assert.equal(b.received.length, 0);
    assert.equal(admin.received.length, 0);
  });

  it("delivers to every tab of the same user and gives each event a unique id", () => {
    const hub = new InMemoryRealtimeHub();
    const t1 = conn("u", "s1");
    const t2 = conn("u", "s2");
    hub.register(t1.c);
    hub.register(t2.c);
    assert.equal(hub.publishToUser("u", { type: "NOTIFICATIONS_READ_ALL" }), 2);
    hub.publishToUser("u", { type: "NOTIFICATIONS_READ_ALL" });
    assert.notEqual(t1.received[0]!.id, t1.received[1]!.id);
    assert.equal(t1.received[0]!.id, t2.received[0]!.id);
  });

  it("publishing to a user with no connection is a harmless no-op", () => {
    const hub = new InMemoryRealtimeHub();
    assert.equal(
      hub.publishToUser("nobody", { type: "NOTIFICATION_CREATED", notificationId: "n" }),
      0,
    );
  });

  it("carries only identifiers: no body/text fields exist on the event", () => {
    const hub = new InMemoryRealtimeHub();
    const x = conn("u");
    hub.register(x.c);
    hub.publishToUser("u", { type: "MESSAGE_CREATED", conversationId: "c", messageId: "m" });
    assert.deepEqual(Object.keys(x.received[0]!).sort(), [
      "conversationId",
      "id",
      "messageId",
      "timestamp",
      "type",
    ]);
  });
});

describe("InMemoryRealtimeHub lifecycle", () => {
  it("unregister removes the listener (no leak) and empties the user entry", () => {
    const hub = new InMemoryRealtimeHub();
    const x = conn("u");
    const off = hub.register(x.c);
    assert.deepEqual(hub.stats(), { connections: 1, users: 1 });
    off();
    assert.deepEqual(hub.stats(), { connections: 0, users: 0 });
    assert.equal(hub.publishToUser("u", { type: "NOTIFICATIONS_READ_ALL" }), 0);
  });

  it("drops a connection whose send fails, without affecting the others", () => {
    const hub = new InMemoryRealtimeHub();
    const dead = conn("u", "s1");
    const live = conn("u", "s2");
    hub.register(dead.c);
    hub.register(live.c);
    dead.state.writable = false;
    assert.equal(hub.publishToUser("u", { type: "NOTIFICATIONS_READ_ALL" }), 1);
    assert.deepEqual(dead.state.closed, ["send-failed"]);
    assert.equal(hub.stats().connections, 1);
  });

  it("a throwing connection can't break delivery to others", () => {
    const hub = new InMemoryRealtimeHub();
    const bad: RealtimeConnection = {
      id: "bad",
      userId: "u",
      sessionId: "s",
      send: () => {
        throw new Error("boom");
      },
      close: () => undefined,
    };
    const ok = conn("u", "s2");
    hub.register(bad);
    hub.register(ok.c);
    assert.equal(hub.publishToUser("u", { type: "NOTIFICATIONS_READ_ALL" }), 1);
    assert.equal(ok.received.length, 1);
  });

  it("closeSession only closes that session; closeUser closes all of a user's", () => {
    const hub = new InMemoryRealtimeHub();
    const a1 = conn("a", "sa1");
    const a2 = conn("a", "sa2");
    const b = conn("b", "sb");
    [a1, a2, b].forEach((x) => hub.register(x.c));
    assert.equal(hub.closeSession("sa1", "logout"), 1);
    assert.deepEqual(a1.state.closed, ["logout"]);
    assert.deepEqual(a2.state.closed, []);
    assert.equal(hub.closeUser("a", "account-suspended"), 2);
    assert.deepEqual(b.state.closed, []);
  });

  it("evicts the oldest stream beyond the per-user cap", () => {
    const hub = new InMemoryRealtimeHub();
    const all = Array.from({ length: MAX_CONNECTIONS_PER_USER + 3 }, (_, i) => conn("u", `s${i}`));
    all.forEach((x) => hub.register(x.c));
    assert.equal(hub.stats().connections, MAX_CONNECTIONS_PER_USER);
    assert.deepEqual(all[0]!.state.closed, ["connection-limit"]);
    assert.deepEqual(all.at(-1)!.state.closed, []);
  });
});
