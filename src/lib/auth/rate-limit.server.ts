import "@tanstack/react-start/server-only";

/**
 * A minimal, dependency-free rate limiter for sensitive auth endpoints
 * (login, register, forgot-password, reset-password).
 *
 * ⚠️ LIMITATION: this state lives in the Node process's memory. It works
 * correctly for local development and a single-instance deployment, but it
 * does NOT coordinate across multiple server instances/processes/regions —
 * each instance enforces its own independent limit, so a distributed
 * deployment behind a load balancer effectively gets `limit × instanceCount`
 * attempts. Before scaling horizontally, swap this module's internals for a
 * shared store (e.g. Redis with `INCR`/`EXPIRE` or `@upstash/ratelimit`)
 * behind the same `checkRateLimit` function signature — call sites don't
 * need to change.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Cap memory usage in long-running dev processes; production should be on a
// real store before this matters.
const MAX_TRACKED_KEYS = 50_000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * @param key A unique identifier for the thing being limited, e.g.
 *   `login:${ip}` or `login:${normalizedEmail}`. Combine IP and account
 *   identifiers at the call site for defense in depth.
 * @param limit Maximum allowed attempts within `windowSeconds`.
 * @param windowSeconds Length of the sliding window, in seconds.
 */
export function checkRateLimit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    if (buckets.size >= MAX_TRACKED_KEYS) buckets.clear();
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000),
    };
  }

  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds: 0 };
}

/** Named limits for each sensitive auth operation. */
export const AUTH_RATE_LIMITS = {
  login: { limit: 10, windowSeconds: 15 * 60 },
  register: { limit: 5, windowSeconds: 60 * 60 },
  forgotPassword: { limit: 5, windowSeconds: 60 * 60 },
  resetPassword: { limit: 10, windowSeconds: 60 * 60 },
} as const;
