import { redirect } from "@tanstack/react-router";

import type { UserRole } from "@/lib/validation/enums";

import { getCurrentUserFn } from "./functions";

/**
 * `beforeLoad` factories for protecting `/patient/*`, `/doctor/*`,
 * `/hospital/*`, and `/admin/*` routes. Safe to import from any route file
 * (client or server) — `getCurrentUserFn` is the RPC boundary; no
 * server-only/database code is ever referenced directly here.
 *
 * `beforeLoad` runs both during SSR and on client-side navigation, so the
 * redirect thrown here is caught correctly by the router in both cases.
 */

async function loadUserOrRedirectToLogin() {
  const user = await getCurrentUserFn();
  if (!user) {
    throw redirect({ to: "/login" });
  }
  return user;
}

/** Unauthenticated -> /login. Authenticated with the wrong role -> /unauthorized. */
export function requireRoleBeforeLoad(role: UserRole) {
  return async () => {
    const user = await loadUserOrRedirectToLogin();
    if (user.role !== role) {
      throw redirect({ to: "/unauthorized" });
    }
    return { user };
  };
}

export function requireAnyRoleBeforeLoad(roles: UserRole[]) {
  return async () => {
    const user = await loadUserOrRedirectToLogin();
    if (!roles.includes(user.role)) {
      throw redirect({ to: "/unauthorized" });
    }
    return { user };
  };
}

/** Any authenticated (active) user, regardless of role. */
export function requireUserBeforeLoad() {
  return async () => {
    const user = await loadUserOrRedirectToLogin();
    return { user };
  };
}
