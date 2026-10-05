import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { describeError, redactQueryParams } from "../../src/lib/error-capture";

const SECRET = "SECRET-PRIVATE-MESSAGE-BODY-or-clinical-note";

function drizzleLikeError(): Error {
  const cause = new Error(`insert or update on table "messages" violates foreign key constraint`);
  cause.name = "PostgresError";
  const err = new Error(
    `Failed query: insert into "messages" ("body", "sender_id") values ($1, $2)\nparams: ${SECRET},3f2a-user-id`,
    { cause },
  );
  err.name = "DrizzleQueryError";
  return err;
}

const saved = { ...process.env };
afterEach(() => {
  process.env["MEDIX_LOG_SQL_PARAMS"] = saved["MEDIX_LOG_SQL_PARAMS"] as string;
  if (saved["MEDIX_LOG_SQL_PARAMS"] === undefined) delete process.env["MEDIX_LOG_SQL_PARAMS"];
  process.env["NODE_ENV"] = saved["NODE_ENV"] as string;
  if (saved["NODE_ENV"] === undefined) delete process.env["NODE_ENV"];
});

describe("log redaction of bound SQL parameters", () => {
  it("removes parameter VALUES but keeps the SQL, error type and stack frames", () => {
    const text = describeError(drizzleLikeError());
    assert.ok(!text.includes(SECRET), "private value leaked into log text");
    assert.ok(!text.includes("3f2a-user-id"));
    assert.match(text, /DrizzleQueryError: Failed query: insert into "messages"/);
    assert.match(text, /params: \[redacted\]/);
    assert.match(text, /\n\s+at /, "stack frames are preserved for debugging");
    assert.match(text, /caused by: PostgresError: insert or update on table/);
  });

  it("leaves ordinary errors untouched", () => {
    const e = new Error("plain failure with params: but no newline");
    assert.ok(describeError(e).includes("plain failure with params: but no newline"));
    assert.equal(redactQueryParams("no params here"), "no params here");
  });

  it("can keep parameters for local debugging, but never in production", () => {
    process.env["MEDIX_LOG_SQL_PARAMS"] = "1";
    process.env["NODE_ENV"] = "development";
    assert.ok(describeError(drizzleLikeError()).includes(SECRET));
    process.env["NODE_ENV"] = "production";
    assert.ok(
      !describeError(drizzleLikeError()).includes(SECRET),
      "flag must be ignored in production",
    );
  });

  it("handles non-Error values and bounded cause chains", () => {
    assert.equal(describeError("just a string"), "just a string");
    let e: Error = new Error("root");
    for (let i = 0; i < 20; i++) e = new Error(`level ${i}`, { cause: e });
    assert.ok(describeError(e).split("caused by:").length <= 5);
  });
});
