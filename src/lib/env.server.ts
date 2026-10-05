import "@tanstack/react-start/server-only";

/**
 * Production environment validation.
 *
 * `validateServerEnv` is a pure function (unit-tested). In production the
 * server entry (src/server.ts) calls `assertServerEnv()` once at boot so a
 * misconfigured deployment fails immediately with a clear, VALUE-FREE message
 * (it names missing variables; it never prints a secret or a connection
 * string). In development nothing is enforced — convenient defaults apply and
 * `src/lib/auth/env.server.ts` still warns about a weak secret.
 *
 * Variable reference: README → "Environment variables".
 */
export interface EnvReport {
  errors: string[];
  warnings: string[];
}

const MIN_SESSION_SECRET_LENGTH = 32;

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateServerEnv(env: Record<string, string | undefined>): EnvReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const production = env["NODE_ENV"] === "production";
  if (!production) return { errors, warnings };

  const dbUrl = env["DATABASE_URL"];
  if (!dbUrl) errors.push("DATABASE_URL is required in production.");
  else if (!/^postgres(ql)?:\/\//.test(dbUrl))
    errors.push("DATABASE_URL must be a postgres:// URL.");

  const secret = env["SESSION_SECRET"];
  if (!secret) errors.push("SESSION_SECRET is required in production.");
  else if (secret.length < MIN_SESSION_SECRET_LENGTH) {
    errors.push(`SESSION_SECRET must be at least ${MIN_SESSION_SECRET_LENGTH} characters.`);
  }

  const appUrl = env["APP_URL"];
  if (!appUrl) {
    errors.push("APP_URL is required in production (password-reset links are built from it).");
  } else if (!isHttpUrl(appUrl)) {
    errors.push("APP_URL must be an http(s) URL.");
  } else if (/localhost|127\.0\.0\.1/.test(appUrl)) {
    warnings.push("APP_URL points at localhost; emailed links will only work on this machine.");
  }

  if (!env["MAIL_PROVIDER"]) {
    warnings.push("MAIL_PROVIDER is not set: email-sending flows (password reset) will fail.");
  }
  if (!env["MEDICAL_UPLOAD_DIR"]) {
    warnings.push(
      "MEDICAL_UPLOAD_DIR is not set: uploads use ./private-uploads, which is lost on ephemeral hosts.",
    );
  }
  return { errors, warnings };
}

let checked = false;

/** Throws once at boot in production when required variables are missing/invalid. Idempotent. */
export function assertServerEnv(env: Record<string, string | undefined> = process.env): void {
  if (checked) return;
  const { errors, warnings } = validateServerEnv(env);
  for (const w of warnings) console.warn(`[env] ${w}`);
  if (errors.length > 0) {
    throw new Error(
      `Invalid production configuration:\n${errors.map((e) => `  - ${e}`).join("\n")}\n` +
        `See README → "Environment variables".`,
    );
  }
  checked = true;
}
