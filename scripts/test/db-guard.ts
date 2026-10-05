/**
 * Test-database safety guard. FAILS CLOSED.
 *
 * A destructive/integration test may only run when ALL of these hold:
 *   1. TEST_DATABASE_URL is set (tests never fall back to DATABASE_URL);
 *   2. the database name contains the standalone word "test" (medix_test, test-medix, …);
 *   3. it is not the application/development database (DATABASE_URL / .env);
 *   4. the host is local (localhost / 127.0.0.1 / ::1) unless TEST_ALLOW_REMOTE_DB=1;
 *   5. the database contains the SENTINEL table written by `npm run test:db:setup`.
 *
 * (5) is the strong guarantee: a populated development or production
 * database can never carry that sentinel, so even a database that is
 * misnamed "…_test" is refused unless this project's own setup script
 * created it (or adopted a completely EMPTY database).
 */
import postgres from "postgres";

export const SENTINEL_TABLE = "medix_test_sentinel";
export const SENTINEL_PURPOSE = "medix-disposable-test-db";

export class TestDatabaseSafetyError extends Error {
  constructor(message: string) {
    super(`\n\n✖ TEST DATABASE SAFETY GUARD — refusing to continue.\n${message}\n`);
    this.name = "TestDatabaseSafetyError";
  }
}

export interface UrlVerdict {
  ok: boolean;
  reasons: string[];
  host?: string;
  port?: string;
  dbName?: string;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const RESERVED_DB_NAMES = new Set(["postgres", "template0", "template1"]);
const TEST_WORD = /(^|[^a-z0-9])test([^a-z0-9]|$)/i;

export function parseDatabaseUrl(
  raw: string,
): { host: string; port: string; dbName: string } | undefined {
  try {
    const url = new URL(raw);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") return undefined;
    return {
      host: url.hostname.toLowerCase(),
      port: url.port || "5432",
      dbName: decodeURIComponent(url.pathname.replace(/^\//, "")),
    };
  } catch {
    return undefined;
  }
}

/** Pure URL-level checks (no connection). Exported for unit testing. */
export function evaluateTestDatabaseUrl(
  testUrl: string | undefined,
  opts: { applicationUrl?: string; allowRemote?: boolean } = {},
): UrlVerdict {
  const reasons: string[] = [];
  if (!testUrl) return { ok: false, reasons: ["TEST_DATABASE_URL is not set."] };

  const parsed = parseDatabaseUrl(testUrl);
  if (!parsed) {
    return { ok: false, reasons: ["TEST_DATABASE_URL is not a valid postgres:// URL."] };
  }
  const { host, port, dbName } = parsed;

  if (!dbName) reasons.push("TEST_DATABASE_URL has no database name.");
  else if (RESERVED_DB_NAMES.has(dbName.toLowerCase())) {
    reasons.push(`"${dbName}" is a reserved PostgreSQL database.`);
  } else if (!TEST_WORD.test(dbName)) {
    reasons.push(
      `Database name "${dbName}" must contain the standalone word "test" (e.g. medix_test).`,
    );
  }

  if (!opts.allowRemote && !LOCAL_HOSTS.has(host)) {
    reasons.push(
      `Host "${host}" is not local. Remote test databases need TEST_ALLOW_REMOTE_DB=1 (CI service containers are local).`,
    );
  }

  if (opts.applicationUrl) {
    const app = parseDatabaseUrl(opts.applicationUrl);
    if (app && app.host === host && app.port === port && app.dbName === dbName) {
      reasons.push(
        `TEST_DATABASE_URL points at the SAME database as DATABASE_URL ("${dbName}"). Tests must never use the application database.`,
      );
    }
  }

  return { ok: reasons.length === 0, reasons, host, port, dbName };
}

/** Does the target database carry the sentinel written by `test:db:setup`? */
export async function hasSentinel(url: string): Promise<boolean> {
  const sql = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: 10 });
  try {
    const [reg] = await sql`select to_regclass(${`public.${SENTINEL_TABLE}`}) as t`;
    if (!reg?.["t"]) return false;
    const rows = await sql.unsafe(
      `select purpose from public.${SENTINEL_TABLE} where purpose = '${SENTINEL_PURPOSE}'`,
    );
    return rows.length > 0;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/**
 * The gate every DB-touching test entry point calls. Throws
 * TestDatabaseSafetyError (never returns false) so a misconfiguration can't
 * be silently ignored.
 */
export async function assertSafeTestDatabase(
  testUrl: string | undefined,
  opts: { applicationUrl?: string; allowRemote?: boolean } = {},
): Promise<{ dbName: string; host: string }> {
  const verdict = evaluateTestDatabaseUrl(testUrl, opts);
  if (!verdict.ok) {
    throw new TestDatabaseSafetyError(verdict.reasons.map((r) => `  • ${r}`).join("\n"));
  }
  let sentinel: boolean;
  try {
    sentinel = await hasSentinel(testUrl!);
  } catch (error) {
    throw new TestDatabaseSafetyError(
      `  • Could not connect to the test database (${(error as Error).message}).\n` +
        `    Create it with: npm run test:db:setup`,
    );
  }
  if (!sentinel) {
    throw new TestDatabaseSafetyError(
      `  • Database "${verdict.dbName}" has no ${SENTINEL_TABLE} marker, so it was not created by\n` +
        `    this project's test setup. Refusing to run tests against it.\n` +
        `    If it is a throwaway database, run: npm run test:db:setup`,
    );
  }
  return { dbName: verdict.dbName!, host: verdict.host! };
}
