/**
 * Preloaded (via `tsx --import ./tests/support/preload.ts`) before ANY
 * database-backed test file or helper script, so it runs before `src/db`
 * reads DATABASE_URL. It:
 *   1. resolves TEST_DATABASE_URL (never DATABASE_URL),
 *   2. runs the fail-closed safety guard (name + not-the-dev-DB + local + sentinel),
 *   3. only then points the application's DATABASE_URL at the test database.
 * If any check fails the process aborts before a single query is issued.
 */
import {
  getApplicationDatabaseUrl,
  getTestConfig,
  requireTestDatabaseUrl,
} from "../../scripts/test/config";
import { assertSafeTestDatabase } from "../../scripts/test/db-guard";

const applicationUrl = getApplicationDatabaseUrl();
const cfg = getTestConfig();
const testUrl = requireTestDatabaseUrl(cfg);

await assertSafeTestDatabase(testUrl, { applicationUrl, allowRemote: cfg.allowRemoteDb });

process.env["DATABASE_URL"] = testUrl;
process.env["SESSION_SECRET"] = cfg.sessionSecret;
process.env["MEDICAL_UPLOAD_DIR"] ??= cfg.uploadDir;
process.env["NODE_ENV"] ??= "test";
