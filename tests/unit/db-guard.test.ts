import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluateTestDatabaseUrl, parseDatabaseUrl } from "../../scripts/test/db-guard";

const ok = (url: string, opts?: Parameters<typeof evaluateTestDatabaseUrl>[1]) =>
  evaluateTestDatabaseUrl(url, opts);

describe("test-database URL guard (pure rules)", () => {
  it("accepts a local database whose name contains the word test", () => {
    for (const name of [
      "medix_test",
      "test_medix",
      "medix-test",
      "MEDIX_TEST",
      "ci_test_1",
      "test",
    ]) {
      const v = ok(`postgres://u:p@localhost:5432/${name}`);
      assert.equal(v.ok, true, `${name}: ${v.reasons.join("; ")}`);
    }
    for (const host of ["127.0.0.1", "[::1]"]) {
      assert.equal(ok(`postgresql://u:p@${host}:5432/medix_test`).ok, true, host);
    }
  });

  it("rejects when TEST_DATABASE_URL is missing or not a postgres URL", () => {
    assert.equal(evaluateTestDatabaseUrl(undefined).ok, false);
    assert.equal(evaluateTestDatabaseUrl("").ok, false);
    assert.equal(ok("mysql://u:p@localhost/medix_test").ok, false);
    assert.equal(ok("not a url").ok, false);
  });

  it("rejects names without the standalone word test (incl. look-alikes)", () => {
    for (const name of [
      "medix",
      "medix_dev",
      "production",
      "contest",
      "latest",
      "medixtest",
      "testing",
    ]) {
      assert.equal(ok(`postgres://u:p@localhost:5432/${name}`).ok, false, name);
    }
  });

  it("rejects reserved PostgreSQL databases and a missing database name", () => {
    assert.equal(ok("postgres://u:p@localhost:5432/postgres").ok, false);
    assert.equal(ok("postgres://u:p@localhost:5432/template1").ok, false);
    assert.equal(ok("postgres://u:p@localhost:5432/").ok, false);
  });

  it("rejects remote hosts (e.g. a Neon production URL) unless explicitly allowed", () => {
    const neon = "postgres://u:p@ep-cool-123.us-east-2.aws.neon.tech/medix_test?sslmode=require";
    const refused = ok(neon);
    assert.equal(refused.ok, false);
    assert.match(refused.reasons.join(" "), /not local/);
    assert.equal(ok(neon, { allowRemote: true }).ok, true);
  });

  it("rejects the application database even when its name contains test", () => {
    const dev = "postgres://u:p@localhost:5432/medix_test";
    const v = ok("postgres://other:pw@localhost:5432/medix_test", { applicationUrl: dev });
    assert.equal(v.ok, false);
    assert.match(v.reasons.join(" "), /SAME database as DATABASE_URL/);
    // different database on the same server is fine
    assert.equal(
      ok("postgres://u:p@localhost:5432/medix_test", {
        applicationUrl: "postgres://u:p@localhost:5432/medix",
      }).ok,
      true,
    );
  });

  it("parses URLs with special characters in the password", () => {
    const p = parseDatabaseUrl("postgres://user:p%40ss%2Fword@localhost:6543/medix_test");
    assert.deepEqual(p, { host: "localhost", port: "6543", dbName: "medix_test" });
  });
});
