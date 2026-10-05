import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluateSeedSafety } from "../../src/db/seed-guard";
import { validateServerEnv } from "../../src/lib/env.server";

const goodProd = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://u:p@db.example.com:5432/medix",
  SESSION_SECRET: "x".repeat(40),
  APP_URL: "https://medix.example.com",
  MAIL_PROVIDER: "smtp",
  MEDICAL_UPLOAD_DIR: "/var/lib/medix/uploads",
};

describe("production environment validation", () => {
  it("accepts a complete production configuration", () => {
    assert.deepEqual(validateServerEnv(goodProd), { errors: [], warnings: [] });
  });

  it("enforces nothing outside production (development stays convenient)", () => {
    assert.deepEqual(validateServerEnv({ NODE_ENV: "development" }), { errors: [], warnings: [] });
    assert.deepEqual(validateServerEnv({}), { errors: [], warnings: [] });
  });

  it("reports each missing/invalid required variable, by name only", () => {
    const { errors } = validateServerEnv({ NODE_ENV: "production" });
    const text = errors.join("\n");
    for (const name of ["DATABASE_URL", "SESSION_SECRET", "APP_URL"])
      assert.match(text, new RegExp(name));
  });

  it("rejects a weak SESSION_SECRET and a malformed DATABASE_URL / APP_URL", () => {
    const { errors } = validateServerEnv({
      ...goodProd,
      SESSION_SECRET: "short",
      DATABASE_URL: "mysql://nope",
      APP_URL: "not-a-url",
    });
    assert.equal(errors.length, 3);
  });

  it("never echoes secret values in messages", () => {
    const secretLooking = "SUPER-SECRET-DB-PASSWORD";
    const { errors, warnings } = validateServerEnv({
      ...goodProd,
      DATABASE_URL: `mysql://user:${secretLooking}@host/db`,
      SESSION_SECRET: "tiny-secret-value",
    });
    assert.ok(!JSON.stringify({ errors, warnings }).includes(secretLooking));
    assert.ok(!JSON.stringify({ errors, warnings }).includes("tiny-secret-value"));
  });

  it("warns (does not fail) about optional-but-important settings and localhost APP_URL", () => {
    const r = validateServerEnv({
      ...goodProd,
      MAIL_PROVIDER: undefined,
      MEDICAL_UPLOAD_DIR: undefined,
      APP_URL: "http://localhost:3000",
    });
    assert.equal(r.errors.length, 0);
    assert.equal(r.warnings.length, 3);
  });
});

describe("seed safety guard", () => {
  const local = { DATABASE_URL: "postgres://u:p@localhost:5432/medix" };

  it("allows a local, non-production database", () => {
    assert.equal(evaluateSeedSafety(local).allowed, true);
    assert.equal(evaluateSeedSafety({ ...local, NODE_ENV: "test" }).allowed, true);
    assert.equal(evaluateSeedSafety({ DATABASE_URL: "postgres://u:p@127.0.0.1/x" }).allowed, true);
  });

  it("refuses NODE_ENV=production even for a local database", () => {
    const v = evaluateSeedSafety({ ...local, NODE_ENV: "production" });
    assert.equal(v.allowed, false);
    assert.match(v.reason!, /production/);
  });

  it("refuses a remote host (e.g. Neon) unless explicitly allowed", () => {
    const neon = {
      DATABASE_URL: "postgres://u:p@ep-x.us-east-2.aws.neon.tech/neondb?sslmode=require",
    };
    const v = evaluateSeedSafety(neon);
    assert.equal(v.allowed, false);
    assert.match(v.reason!, /non-local database host/);
    assert.ok(!v.reason!.includes("u:p"), "reason must not echo credentials");
    assert.equal(evaluateSeedSafety({ ...neon, MEDIX_ALLOW_REMOTE_SEED: "true" }).allowed, true);
    assert.equal(
      evaluateSeedSafety({ ...neon, NODE_ENV: "production", MEDIX_ALLOW_REMOTE_SEED: "true" })
        .allowed,
      false,
      "the override can never beat the production check",
    );
  });

  it("refuses a missing or malformed DATABASE_URL", () => {
    assert.equal(evaluateSeedSafety({}).allowed, false);
    assert.equal(evaluateSeedSafety({ DATABASE_URL: "%%%" }).allowed, false);
  });
});
