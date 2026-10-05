import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";

import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/lib/validation/auth";

import { AuthError } from "./errors";
import {
  loginUser,
  logoutCurrentUser,
  registerUser,
  requestPasswordReset,
  resetPassword,
} from "./service.server";
import { getCurrentUser } from "./authorization.server";

/**
 * Everything in this file is safe to import from route/component code that
 * ends up in the client bundle: `createServerFn` compiles each `.handler()`
 * body (and everything it calls into, including the `*.server.ts` modules
 * above) into a server-only chunk, replacing it client-side with a small
 * RPC stub. The actual database/session/password logic never reaches the
 * browser — enforced at build time by the `server-only` guards in those
 * modules (the production build fails if that boundary is ever broken).
 */

function clientRateLimitKey(): string {
  return getRequestIP({ xForwardedFor: true }) ?? "unknown";
}

/** A plain, serializable error shape for the client — never a raw exception. */
export interface AuthActionError {
  message: string;
}

export type AuthActionResult<T extends object> =
  ({ ok: true } & T) | ({ ok: false } & AuthActionError);
export type SimpleAuthResult = { ok: true } | ({ ok: false } & AuthActionError);

function toActionError(error: unknown): AuthActionError {
  if (error instanceof AuthError) return { message: error.message };
  console.error("[auth] unexpected error:", error);
  return { message: "Something went wrong. Please try again." };
}

export const loginFn = createServerFn({ method: "POST" })
  .validator(loginSchema)
  .handler(async ({ data }): Promise<AuthActionResult<{ dashboardPath: string }>> => {
    try {
      const result = await loginUser(data, clientRateLimitKey());
      return { ok: true, dashboardPath: result.dashboardPath };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

export const registerFn = createServerFn({ method: "POST" })
  .validator(registerSchema)
  .handler(async ({ data }): Promise<AuthActionResult<{ dashboardPath: string }>> => {
    try {
      const result = await registerUser(data, clientRateLimitKey());
      return { ok: true, dashboardPath: result.dashboardPath };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  const user = await getCurrentUser();
  await logoutCurrentUser(user?.id ?? null);
  return { ok: true as const };
});

export const forgotPasswordFn = createServerFn({ method: "POST" })
  .validator(forgotPasswordSchema)
  .handler(async ({ data }): Promise<SimpleAuthResult> => {
    try {
      await requestPasswordReset(data, clientRateLimitKey());
      return { ok: true };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

export const resetPasswordFn = createServerFn({ method: "POST" })
  .validator(resetPasswordSchema)
  .handler(async ({ data }): Promise<SimpleAuthResult> => {
    try {
      await resetPassword(data, clientRateLimitKey());
      return { ok: true };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

/** Safe current-user fetch — returns `null` rather than throwing when signed out. */
export const getCurrentUserFn = createServerFn({ method: "GET" }).handler(async () => {
  return getCurrentUser();
});
