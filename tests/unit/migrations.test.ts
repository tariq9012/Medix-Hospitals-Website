import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { PROJECT_ROOT, RUN_DIR } from "../../scripts/test/config";
import { verifyMigrationFolder } from "../../scripts/test/check-migrations";

const real = path.join(PROJECT_ROOT, "drizzle");
let work: string;

/** Fresh corruptible copy of the real migrations folder. */
function copy(): string {
  const dir = path.join(work, String(Math.random()).slice(2));
  cpSync(real, dir, { recursive: true });
  return dir;
}
function editJournal(dir: string, fn: (j: { entries: Record<string, unknown>[] }) => void) {
  const file = path.join(dir, "meta", "_journal.json");
  const j = JSON.parse(readFileSync(file, "utf8"));
  fn(j);
  writeFileSync(file, JSON.stringify(j));
}

before(() => {
  mkdirSync(RUN_DIR, { recursive: true });
  work = mkdtempSync(path.join(RUN_DIR, "migrations-unit-"));
});
after(() => rmSync(work, { recursive: true, force: true }));

describe("migration folder verification", () => {
  it("the real repository migrations are healthy", () => {
    assert.deepEqual(verifyMigrationFolder(real), []);
  });

  it("detects a SQL file the journal does not register (the Phase 8 bug)", () => {
    const dir = copy();
    editJournal(dir, (j) => j.entries.splice(4, 1));
    const problems = verifyMigrationFolder(dir).join("\n");
    assert.match(problems, /0004_busy_famine\.sql: SQL file exists but is NOT registered/);
  });

  it("detects a journal entry whose SQL file is missing", () => {
    const dir = copy();
    rmSync(path.join(dir, "0009_eminent_black_tom.sql"));
    assert.match(verifyMigrationFolder(dir).join("\n"), /missing 0009_eminent_black_tom\.sql/);
  });

  it("detects a missing snapshot", () => {
    const dir = copy();
    rmSync(path.join(dir, "meta", "0006_snapshot.json"));
    assert.match(verifyMigrationFolder(dir).join("\n"), /missing meta\/0006_snapshot\.json/);
  });

  it("detects out-of-order timestamps that would make migrate silently skip work", () => {
    const dir = copy();
    editJournal(dir, (j) => {
      j.entries[9]!["when"] = (j.entries[8]!["when"] as number) - 1;
    });
    assert.match(verifyMigrationFolder(dir).join("\n"), /would silently SKIP this one/);
  });

  it("detects wrong idx, wrong tag prefix and duplicate tags", () => {
    const dir = copy();
    editJournal(dir, (j) => {
      j.entries[3]!["idx"] = 7;
      j.entries[5]!["tag"] = j.entries[4]!["tag"];
    });
    const problems = verifyMigrationFolder(dir).join("\n");
    assert.match(problems, /idx is 7, expected 3/);
    assert.match(problems, /duplicate tag/);
  });

  it("detects a broken snapshot chain", () => {
    const dir = copy();
    const file = path.join(dir, "meta", "0003_snapshot.json");
    const snap = JSON.parse(readFileSync(file, "utf8"));
    snap.prevId = "00000000-dead-beef-0000-000000000000";
    writeFileSync(file, JSON.stringify(snap));
    assert.match(verifyMigrationFolder(dir).join("\n"), /snapshot prevId does not link/);
  });

  it("reports an empty SQL file and invalid journal JSON", () => {
    const dir = copy();
    writeFileSync(path.join(dir, "0002_yielding_king_cobra.sql"), "   \n");
    assert.match(verifyMigrationFolder(dir).join("\n"), /SQL file is empty/);
    writeFileSync(path.join(dir, "meta", "_journal.json"), "{ not json");
    assert.match(verifyMigrationFolder(dir).join("\n"), /not valid JSON/);
  });
});
