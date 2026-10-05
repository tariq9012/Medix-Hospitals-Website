/**
 * Safety rules for the development seed (and any other dev-only data script).
 * Pure + dependency-free so it can be unit-tested and run before any DB access.
 *
 * The seed inserts fictional users that all share a publicly documented
 * password, so it must NEVER reach a production or shared remote database:
 *   - refuses when NODE_ENV=production;
 *   - refuses any non-local database host unless MEDIX_ALLOW_REMOTE_SEED=true
 *     is set deliberately (e.g. a throwaway cloud dev branch);
 *   - refuses when DATABASE_URL is missing/invalid.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export interface SeedSafety {
  allowed: boolean;
  reason?: string;
}

export function evaluateSeedSafety(env: Record<string, string | undefined>): SeedSafety {
  if (env["NODE_ENV"] === "production") {
    return {
      allowed: false,
      reason: "Refusing to run development seed data with NODE_ENV=production.",
    };
  }
  const raw = env["DATABASE_URL"];
  if (!raw) return { allowed: false, reason: "DATABASE_URL is not set." };

  let host: string;
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    return { allowed: false, reason: "DATABASE_URL is not a valid URL." };
  }
  if (!LOCAL_HOSTS.has(host) && env["MEDIX_ALLOW_REMOTE_SEED"] !== "true") {
    return {
      allowed: false,
      reason:
        `Refusing to seed non-local database host "${host}". The seed creates accounts with a ` +
        `publicly documented password. If this is a throwaway dev database, set ` +
        `MEDIX_ALLOW_REMOTE_SEED=true explicitly.`,
    };
  }
  return { allowed: true };
}
