/**
 * Creates / refreshes the DISPOSABLE test database:
 *
 *   (create if missing) → sentinel → migrations → seed → [e2e fixtures]
 *
 *   npm run test:db:setup            # idempotent: ensure DB, migrate, seed
 *   npm run test:db:reset            # drop + recreate, then migrate + seed
 *
 * Safety (never weakened by flags):
 *   - only ever acts on TEST_DATABASE_URL, and only if it passes the URL guard
 *     (name contains "test", not the dev DB, local host);
 *   - an EXISTING database is touched only if it already carries the sentinel
 *     or is completely empty. A populated database without the sentinel is
 *     refused — it is never dropped, truncated, migrated or seeded;
 *   - schema is created by the project's real migrations (programmatic
 *     drizzle migrator = same journal + bookkeeping as `npm run db:migrate`).
 *     `drizzle-kit push` is never used.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import {
  getApplicationDatabaseUrl,
  getTestConfig,
  PROJECT_ROOT,
  requireTestDatabaseUrl,
} from "./config";
import {
  evaluateTestDatabaseUrl,
  hasSentinel,
  parseDatabaseUrl,
  SENTINEL_PURPOSE,
  SENTINEL_TABLE,
  TestDatabaseSafetyError,
} from "./db-guard";

const require = createRequire(import.meta.url);
const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;

export interface SetupOptions {
  reset?: boolean;
  e2eFixtures?: boolean;
  log?: (message: string) => void;
}

function runTsx(args: string[], env: NodeJS.ProcessEnv, label: string, log: (m: string) => void) {
  const tsxCli = require.resolve("tsx/cli");
  const result = spawnSync(process.execPath, [tsxCli, ...args], {
    cwd: PROJECT_ROOT,
    env,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `${label} failed (exit ${result.status}).\n${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    );
  }
  log(`  ✓ ${label}`);
}

export async function setupTestDatabase(options: SetupOptions = {}): Promise<{ url: string }> {
  const log = options.log ?? ((m: string) => console.log(m));
  const cfg = getTestConfig();
  const testUrl = requireTestDatabaseUrl(cfg);

  const verdict = evaluateTestDatabaseUrl(testUrl, {
    applicationUrl: getApplicationDatabaseUrl(),
    allowRemote: cfg.allowRemoteDb,
  });
  if (!verdict.ok) {
    throw new TestDatabaseSafetyError(verdict.reasons.map((r) => `  • ${r}`).join("\n"));
  }
  const dbName = parseDatabaseUrl(testUrl)!.dbName;
  log(`Test database: ${dbName} on ${verdict.host}:${verdict.port}`);

  // 1. Ensure the database exists (via the maintenance DB on the same server).
  const maintenanceUrl = new URL(testUrl);
  maintenanceUrl.pathname = "/postgres";
  const admin = postgres(maintenanceUrl.toString(), {
    max: 1,
    onnotice: () => {},
    connect_timeout: 10,
  });
  try {
    const exists = (await admin`select 1 from pg_database where datname = ${dbName}`).length > 0;

    if (exists) {
      const marked = await hasSentinel(testUrl).catch(() => false);
      if (options.reset) {
        if (!marked) {
          throw new TestDatabaseSafetyError(
            `  • "${dbName}" exists but is not marked as a disposable test database.\n` +
              `    Refusing to DROP it. Remove it yourself if you are certain it is disposable.`,
          );
        }
        log("  resetting (drop + recreate)…");
        await admin.unsafe(`drop database ${quoteIdent(dbName)} with (force)`);
        await admin.unsafe(`create database ${quoteIdent(dbName)}`);
      } else if (!marked) {
        // Adopt only a completely empty database.
        const probe = postgres(testUrl, { max: 1, onnotice: () => {} });
        try {
          const [{ n }] = (await probe`
            select count(*)::int as n from information_schema.tables
            where table_schema in ('public', 'drizzle')`) as unknown as { n: number }[];
          if (n > 0) {
            throw new TestDatabaseSafetyError(
              `  • "${dbName}" already contains ${n} table(s) but no ${SENTINEL_TABLE} marker.\n` +
                `    It was not created by this setup, so it is NOT adopted, migrated or seeded.\n` +
                `    Choose a different TEST_DATABASE_URL (a new, empty database).`,
            );
          }
        } finally {
          await probe.end({ timeout: 5 });
        }
        log("  adopting empty database");
      }
    } else {
      await admin.unsafe(`create database ${quoteIdent(dbName)}`);
      log("  created database");
    }
  } finally {
    await admin.end({ timeout: 5 });
  }

  // 2. Sentinel + migrations (the project's real migrations, in journal order).
  const sql = postgres(testUrl, { max: 1, onnotice: () => {}, connect_timeout: 10 });
  try {
    await sql.unsafe(
      `create table if not exists public.${SENTINEL_TABLE} (` +
        `purpose text primary key, created_at timestamptz not null default now())`,
    );
    await sql.unsafe(
      `insert into public.${SENTINEL_TABLE} (purpose) values ('${SENTINEL_PURPOSE}') on conflict do nothing`,
    );
    await migrate(drizzle(sql), { migrationsFolder: path.join(PROJECT_ROOT, "drizzle") });
    log("  ✓ migrations applied");
  } finally {
    await sql.end({ timeout: 5 });
  }

  // 3. Seed (child process so src/db picks up the test URL; idempotent).
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: testUrl,
    SESSION_SECRET: cfg.sessionSecret,
    SEED_PASSWORD: cfg.password,
    NODE_ENV: "test",
    ...(cfg.allowRemoteDb ? { MEDIX_ALLOW_REMOTE_SEED: "true" } : {}),
  };
  runTsx(["src/db/seed.ts"], childEnv, "seed", log);

  // 4. Optional E2E fixtures (second patient, platform admin, conversations). This child runs behind the
  //    fail-closed preload, which sets DATABASE_URL itself AFTER verifying the target — so it must NOT
  //    inherit a DATABASE_URL (otherwise the guard would see "test DB == application DB" and refuse).
  if (options.e2eFixtures) {
    const { DATABASE_URL: _unused, ...fixtureEnv } = childEnv;
    void _unused;
    runTsx(
      ["--import", "./tests/support/preload.ts", "tests/support/e2e-fixtures.ts"],
      { ...fixtureEnv, TEST_DATABASE_URL: testUrl },
      "e2e fixtures",
      log,
    );
  }
  return { url: testUrl };
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  const args = new Set(process.argv.slice(2));
  setupTestDatabase({ reset: args.has("--reset"), e2eFixtures: args.has("--e2e-fixtures") })
    .then(() => {
      console.log("✓ test database ready");
    })
    .catch((error: Error) => {
      console.error(error.message);
      process.exit(1);
    });
}
