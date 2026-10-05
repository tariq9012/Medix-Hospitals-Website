import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { db, client } from "../../src/db";
import { users } from "../../src/db/schema";
import { describeError } from "../../src/lib/error-capture";

after(() => client.end({ timeout: 5 }));

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

describe("a REAL Drizzle/PostgreSQL error must not leak bound parameters into logs", () => {
  it("redacts values from the logged description while keeping the SQL and error type", async () => {
    const email = `log-leak-probe.${RUN}@example.com`;
    const secretHash = `SECRET-HASH-VALUE-${RUN}`;
    const row = { email, passwordHash: secretHash, role: "PATIENT" as const };

    await db.insert(users).values(row); // first insert succeeds…
    let caught: unknown;
    try {
      await db.insert(users).values(row); // …the duplicate violates users_email_unique
    } catch (error) {
      caught = error;
    }
    assert.ok(caught instanceof Error, "expected the duplicate insert to fail");

    // CONTROL: the raw error really does carry the private values (this is the hazard being fixed).
    const raw = `${(caught as Error).message}`;
    assert.ok(
      raw.includes(secretHash) && raw.includes(email),
      "control: raw Drizzle error embeds params",
    );

    // The logged description does not.
    const logged = describeError(caught);
    assert.ok(!logged.includes(secretHash), "password hash value leaked into log text");
    assert.ok(!logged.includes(email), "email value leaked into log text");
    assert.match(logged, /Failed query: insert into "users"/, "SQL text is kept for debugging");
    assert.match(logged, /params: \[redacted\]/);
    assert.match(logged, /duplicate key value violates unique constraint/, "root cause is kept");
  });
});
