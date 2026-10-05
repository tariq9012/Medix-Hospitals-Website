import "@tanstack/react-start/server-only";

/**
 * Central place to validate auth-related environment configuration. Called
 * lazily from the modules that need each value (there's no single "app
 * startup" hook in a serverless-friendly TanStack Start deployment), but
 * always before the value is used — so a misconfigured production
 * deployment fails loudly instead of silently running with a weak secret.
 */

const MIN_SESSION_SECRET_LENGTH = 32;

let cachedSessionSecret: string | undefined;

export function getSessionSecret(): string {
  if (cachedSessionSecret) return cachedSessionSecret;

  const isProduction = process.env["NODE_ENV"] === "production";
  const configured = process.env["SESSION_SECRET"];

  if (!configured) {
    if (isProduction) {
      throw new Error(
        "SESSION_SECRET is not set. Refusing to start in production without it — " +
          "generate one with `openssl rand -base64 32` and set it in your environment.",
      );
    }
    console.warn(
      "[auth] SESSION_SECRET is not set — using an insecure development-only default. " +
        "Set SESSION_SECRET in .env before deploying.",
    );
    cachedSessionSecret = "insecure-development-only-secret-do-not-use-in-production";
    return cachedSessionSecret;
  }

  if (configured.length < MIN_SESSION_SECRET_LENGTH) {
    const message = `SESSION_SECRET must be at least ${MIN_SESSION_SECRET_LENGTH} characters.`;
    if (isProduction) throw new Error(message);
    console.warn(`[auth] ${message} Continuing in development only.`);
  }

  cachedSessionSecret = configured;
  return cachedSessionSecret;
}

export function getSessionMaxAgeSeconds(): number {
  const days = Number(process.env["AUTH_SESSION_MAX_AGE_DAYS"] ?? 7);
  const safeDays = Number.isFinite(days) && days > 0 ? days : 7;
  return safeDays * 24 * 60 * 60;
}

export function isProductionEnv(): boolean {
  return process.env["NODE_ENV"] === "production";
}
