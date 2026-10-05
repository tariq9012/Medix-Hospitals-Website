import "@tanstack/react-start/server-only";

import { and, eq } from "drizzle-orm";

import { doctors, hospitals, users } from "@/db/schema";

/**
 * THE single definition of "publicly visible / operational" — used by the
 * public directory, search, specialty pages, homepage queries, public detail
 * routes, and (via appointments/queries.server.ts) booking discovery, so the
 * rules can never diverge.
 *
 * Doctor: own account ACTIVE + verification APPROVED + marked available.
 * Queries applying this MUST inner-join `users` on `doctors.userId`.
 * Suspending/rejecting/re-opening a doctor flips `verificationStatus`, which
 * removes them from every public surface with no other bookkeeping;
 * reactivation restores them. Nothing is deleted.
 *
 * Hospital: verification APPROVED (hospitals have no separate account/active
 * flag; suspension is expressed solely via `verificationStatus`).
 */
export const PUBLIC_DOCTOR_CONDITION = and(
  eq(doctors.verificationStatus, "APPROVED"),
  eq(doctors.isAvailable, true),
  eq(users.status, "ACTIVE"),
)!;

export const PUBLIC_HOSPITAL_CONDITION = eq(hospitals.verificationStatus, "APPROVED");

/** Escapes LIKE/ILIKE wildcards so user text is matched literally. */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** Splits a search string into ≤5 literal terms; drops a leading "Dr"/"Dr." title. */
export function searchTerms(q: string | undefined): string[] {
  if (!q) return [];
  return q
    .replace(/^\s*dr\.?\s+/i, "")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, 5);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
