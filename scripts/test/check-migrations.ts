/**
 * Migration integrity check — NO database needed, mutates nothing.
 *
 *   npm run db:check
 *
 * Structural checks (the failure modes that have bitten this project):
 *   - every journal entry has its .sql file and meta/NNNN_snapshot.json;
 *   - no .sql file exists that the journal doesn't register (Phase 8 found a
 *     missing 0004 entry that made `migrate` silently skip work);
 *   - idx values are 0..n-1, tags carry the matching NNNN_ prefix, tags unique;
 *   - journal `when` timestamps strictly increase (drizzle's migrator only
 *     compares the LATEST applied timestamp, so an out-of-order entry is
 *     silently skipped on databases that already ran a later one);
 *   - the snapshot chain is linked (each prevId = the previous snapshot's id);
 *   - `drizzle-kit check` passes and `drizzle-kit generate` finds NO schema
 *     drift — both run against a TEMP COPY of drizzle/, never the real one.
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { PROJECT_ROOT, RUN_DIR } from "./config";

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

/** Pure structural verification of a drizzle migrations folder. Returns a list of problems (empty = healthy). */
export function verifyMigrationFolder(dir: string): string[] {
  const problems: string[] = [];
  const journalPath = path.join(dir, "meta", "_journal.json");
  if (!existsSync(journalPath)) return [`missing ${journalPath}`];

  let journal: { version?: string; dialect?: string; entries?: JournalEntry[] };
  try {
    journal = JSON.parse(readFileSync(journalPath, "utf8"));
  } catch (error) {
    return [`_journal.json is not valid JSON: ${(error as Error).message}`];
  }
  const entries = journal.entries ?? [];
  if (journal.dialect !== "postgresql")
    problems.push(`journal dialect is "${journal.dialect}", expected "postgresql"`);
  if (entries.length === 0) problems.push("journal has no entries");

  const seenTags = new Set<string>();
  let previousWhen = -Infinity;
  let previousSnapshotId: string | undefined;

  entries.forEach((entry, position) => {
    const label = `${entry.tag ?? "(no tag)"}`;
    if (entry.idx !== position)
      problems.push(`${label}: idx is ${entry.idx}, expected ${position}`);
    if (seenTags.has(entry.tag)) problems.push(`${label}: duplicate tag`);
    seenTags.add(entry.tag);
    const prefix = String(position).padStart(4, "0");
    if (!entry.tag?.startsWith(`${prefix}_`))
      problems.push(`${label}: tag should start with "${prefix}_"`);
    if (!(entry.when > previousWhen)) {
      problems.push(
        `${label}: "when" (${entry.when}) is not greater than the previous entry's (${previousWhen}) — ` +
          `databases that already applied a later migration would silently SKIP this one`,
      );
    }
    previousWhen = entry.when;

    const sqlFile = path.join(dir, `${entry.tag}.sql`);
    if (!existsSync(sqlFile)) problems.push(`${label}: missing ${entry.tag}.sql`);
    else if (readFileSync(sqlFile, "utf8").trim().length === 0)
      problems.push(`${label}: SQL file is empty`);

    const snapFile = path.join(dir, "meta", `${prefix}_snapshot.json`);
    if (!existsSync(snapFile)) {
      problems.push(`${label}: missing meta/${prefix}_snapshot.json`);
    } else {
      try {
        const snap = JSON.parse(readFileSync(snapFile, "utf8")) as { id: string; prevId: string };
        if (
          position > 0 &&
          previousSnapshotId !== undefined &&
          snap.prevId !== previousSnapshotId
        ) {
          problems.push(`${label}: snapshot prevId does not link to the previous snapshot's id`);
        }
        previousSnapshotId = snap.id;
      } catch {
        problems.push(`${label}: snapshot is not valid JSON`);
      }
    }
  });

  const registered = new Set(entries.map((e) => e.tag));
  for (const file of readdirSync(dir)) {
    if (file.endsWith(".sql") && !registered.has(file.slice(0, -4))) {
      problems.push(
        `${file}: SQL file exists but is NOT registered in _journal.json (migrate would ignore it)`,
      );
    }
  }
  return problems;
}

function runDrizzleKit(args: string[], cwd: string) {
  const bin = path.join(PROJECT_ROOT, "node_modules", "drizzle-kit", "bin.cjs");
  return spawnSync(process.execPath, [bin, ...args], { cwd, encoding: "utf8" });
}

/** Runs `drizzle-kit check` and `generate` against a TEMP COPY so the real folder is never modified. */
export function checkSchemaDrift(): string[] {
  const problems: string[] = [];
  // The temp copy lives INSIDE the (git-ignored) run dir because drizzle-kit
  // resolves `out`/`schema` relative to the project (an absolute os.tmpdir()
  // path breaks it, and on Windows may sit on another drive).
  mkdirSync(RUN_DIR, { recursive: true });
  const tmp = mkdtempSync(path.join(RUN_DIR, "drizzle-check-"));
  try {
    const out = path.join(tmp, "drizzle");
    cpSync(path.join(PROJECT_ROOT, "drizzle"), out, { recursive: true });
    const toRel = (p: string) => path.relative(PROJECT_ROOT, p).split(path.sep).join("/");
    const configPath = path.join(tmp, "drizzle.config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        dialect: "postgresql",
        schema: "src/db/schema/index.ts",
        out: toRel(out),
      }),
    );

    const check = runDrizzleKit(["check", `--config=${configPath}`], PROJECT_ROOT);
    if (check.status !== 0 || /error|collision|inconsistent/i.test(check.stdout + check.stderr)) {
      problems.push(`drizzle-kit check failed:\n${check.stdout}${check.stderr}`);
    }

    const gen = runDrizzleKit(["generate", `--config=${configPath}`], PROJECT_ROOT);
    const text = gen.stdout + gen.stderr;
    if (gen.status !== 0) problems.push(`drizzle-kit generate failed:\n${text}`);
    else if (!/No schema changes/i.test(text)) {
      problems.push(
        "SCHEMA DRIFT: src/db/schema differs from the migrations. Run `npm run db:generate`, review and commit the new migration.\n" +
          text,
      );
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return problems;
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  const dir = path.join(PROJECT_ROOT, "drizzle");
  const problems = [...verifyMigrationFolder(dir)];
  const structural = problems.length;
  if (structural === 0) problems.push(...checkSchemaDrift());

  if (problems.length > 0) {
    console.error("✖ Migration integrity check FAILED:\n");
    for (const p of problems) console.error(`  • ${p}`);
    process.exit(1);
  }
  const count = readdirSync(dir).filter((f) => f.endsWith(".sql")).length;
  console.log(
    `✓ ${count} migrations: journal, files, snapshots, ordering and schema drift all consistent`,
  );
}
