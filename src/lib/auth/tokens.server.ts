import "@tanstack/react-start/server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { getSessionSecret } from "./env.server";

/**
 * Shared primitives for every opaque token this app issues: session tokens,
 * password-reset tokens, and email-verification tokens. The raw token is
 * only ever held in memory (to put in a cookie or an email link) — what
 * gets persisted is always `hashToken(raw)`, an HMAC keyed with
 * `SESSION_SECRET`. That means a database leak alone reveals nothing usable
 * (the attacker still needs the app secret *and* the raw token), and an app
 * secret leak alone doesn't help without the database.
 */

/** 256 bits of randomness, URL-safe — safe to put directly in a cookie or a link. */
export function generateSecureToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(rawToken: string): string {
  return createHmac("sha256", getSessionSecret()).update(rawToken).digest("hex");
}

/** Constant-time comparison for the rare case a raw hash needs comparing directly. */
export function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
