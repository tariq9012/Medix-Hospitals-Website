import "@tanstack/react-start/server-only";

import { Algorithm, hash, verify } from "@node-rs/argon2";

/**
 * Centralized password hashing. Argon2id (OWASP's current recommendation)
 * via `@node-rs/argon2` — a prebuilt native binding (no compiler toolchain
 * required at install time on Windows/macOS/Linux), so it integrates
 * cleanly here without falling back to bcrypt.
 *
 * Parameters follow OWASP's baseline guidance for Argon2id: 19 MiB memory,
 * 2 iterations, 1 degree of parallelism.
 */
const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plainPassword: string): Promise<string> {
  return hash(plainPassword, ARGON2_OPTIONS);
}

export async function verifyPassword(hashed: string, plainPassword: string): Promise<boolean> {
  try {
    return await verify(hashed, plainPassword, ARGON2_OPTIONS);
  } catch {
    // Malformed/foreign hash (e.g. a seed placeholder) — treat as no match
    // rather than letting the error surface as a 500.
    return false;
  }
}

const MIN_PASSWORD_LENGTH = 10;

/**
 * Minimum viable password policy: long enough to resist brute-force, and a
 * mix of character classes to rule out the weakest common passwords. Kept
 * deliberately simple and centralized rather than duplicated between the
 * client form and the server — see `src/lib/validation/auth.ts`, which
 * calls this same check.
 */
export function getPasswordStrengthIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < MIN_PASSWORD_LENGTH) {
    issues.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (!/[a-z]/.test(password)) issues.push("Password must include a lowercase letter.");
  if (!/[A-Z]/.test(password)) issues.push("Password must include an uppercase letter.");
  if (!/[0-9]/.test(password)) issues.push("Password must include a number.");
  return issues;
}
