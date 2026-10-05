import "@tanstack/react-start/server-only";

import { redirect } from "@tanstack/react-router";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { doctors, hospitalAdmins, patientProfiles } from "@/db/schema";
import type { UserRole } from "@/lib/validation/enums";

import { getSessionUser, type SafeUser } from "./session.server";

export type AuthUser = SafeUser & { displayName: string };

/**
 * The authenticated user for the current request, or `null` if there's no
 * valid session — or if the account has since been suspended/deactivated
 * (a session token can still exist and be unexpired, but a blocked account
 * must never be treated as "logged in" for authorization purposes).
 *
 * Adds a best-effort `displayName` (from the role-specific profile table)
 * so dashboard chrome can show a real name instead of a placeholder —
 * without pulling in any other profile data.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const user = await getSessionUser();
  if (!user) return null;
  if (user.status === "SUSPENDED" || user.status === "DEACTIVATED") return null;

  let displayName = user.email;
  if (user.role === "PATIENT") {
    const [profile] = await db
      .select({ firstName: patientProfiles.firstName, lastName: patientProfiles.lastName })
      .from(patientProfiles)
      .where(eq(patientProfiles.userId, user.id))
      .limit(1);
    if (profile) displayName = `${profile.firstName} ${profile.lastName}`.trim();
  } else if (user.role === "DOCTOR") {
    const [doctor] = await db
      .select({ firstName: doctors.firstName, lastName: doctors.lastName })
      .from(doctors)
      .where(eq(doctors.userId, user.id))
      .limit(1);
    if (doctor) displayName = `Dr. ${doctor.firstName} ${doctor.lastName}`.trim();
  }

  return { ...user, displayName };
}

/** Alias kept for call sites that read more naturally as "optional". */
export const getOptionalUser = getCurrentUser;

/** Throws a redirect to `/login` if there's no authenticated (active) user. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw redirect({ to: "/login" });
  }
  return user;
}

/**
 * Throws a redirect to `/login` if unauthenticated, or `/unauthorized` if
 * authenticated with the wrong role. Never silently redirects a
 * wrong-role user into someone else's dashboard.
 */
export async function requireRole(role: UserRole): Promise<AuthUser> {
  const user = await requireUser();
  if (user.role !== role) {
    throw redirect({ to: "/unauthorized" });
  }
  return user;
}

export async function requireAnyRole(roles: UserRole[]): Promise<AuthUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw redirect({ to: "/unauthorized" });
  }
  return user;
}

/**
 * Requires an authenticated, ACTIVE, ADMIN-role user. Admin identity always
 * comes from the session — an admin id or role supplied by the browser is
 * never consulted.
 */
export async function requireAdmin(): Promise<AuthUser> {
  return requireRole("ADMIN");
}

/**
 * Resolves a HOSPITAL_ADMIN session to the hospital(s) that user is actually
 * authorized to manage, via the `hospital_admins` junction table. Returns
 * the user plus their authorized hospital ids, so callers can check a
 * browser-supplied hospital id against this list rather than trusting it.
 *
 * Throws to `/unauthorized` if the account has no hospital assignment at
 * all — an unassigned hospital-admin can't manage anything.
 */
export async function requireHospitalAdmin(): Promise<{
  user: AuthUser;
  hospitalIds: string[];
}> {
  const user = await requireRole("HOSPITAL_ADMIN");
  const rows = await db
    .select({ hospitalId: hospitalAdmins.hospitalId })
    .from(hospitalAdmins)
    .where(eq(hospitalAdmins.userId, user.id));

  if (rows.length === 0) {
    throw redirect({ to: "/unauthorized" });
  }
  return { user, hospitalIds: rows.map((r) => r.hospitalId) };
}

/** Asserts the given hospital is one this admin may manage. Never trust a raw client id. */
export async function requireHospitalAccess(hospitalId: string): Promise<AuthUser> {
  const { user, hospitalIds } = await requireHospitalAdmin();
  if (!hospitalIds.includes(hospitalId)) {
    throw redirect({ to: "/unauthorized" });
  }
  return user;
}

/**
 * A DOCTOR account may sign in while still `PENDING_VERIFICATION`, but
 * operational actions that assume a trusted provider identity should call
 * this instead of `requireRole("DOCTOR")`.
 */
export async function requireVerifiedDoctor(): Promise<AuthUser> {
  const user = await requireRole("DOCTOR");
  const [doctor] = await db
    .select({ verificationStatus: doctors.verificationStatus })
    .from(doctors)
    .where(eq(doctors.userId, user.id))
    .limit(1);

  if (!doctor || doctor.verificationStatus !== "APPROVED") {
    throw redirect({ to: "/unauthorized" });
  }
  return user;
}

/**
 * Hospital-admin accounts aren't yet linked to a specific hospital record
 * (see Phase 3 report — that association is modeled in a later phase), so
 * "verified" is approximated by the account's own status: a platform admin
 * flips it from PENDING_VERIFICATION to ACTIVE once the hospital is vetted.
 */
export async function requireVerifiedHospital(): Promise<AuthUser> {
  const user = await requireRole("HOSPITAL_ADMIN");
  if (user.status !== "ACTIVE") {
    throw redirect({ to: "/unauthorized" });
  }
  return user;
}
