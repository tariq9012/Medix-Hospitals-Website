import "@tanstack/react-start/server-only";

import {
  deleteCookie,
  getCookie,
  getRequestHeader,
  getRequestIP,
  setCookie,
} from "@tanstack/react-start/server";
import { and, eq, gt } from "drizzle-orm";

import { db } from "@/db";
import { authSessions, users, type User } from "@/db/schema";

import { isProductionEnv, getSessionMaxAgeSeconds } from "./env.server";
import { generateSecureToken, hashToken } from "./tokens.server";
import { revokeRealtimeForSession, revokeRealtimeForUser } from "@/lib/realtime/events.server";

const SESSION_COOKIE_NAME = "medix_session";

export type SafeUser = Pick<
  User,
  "id" | "email" | "role" | "status" | "emailVerified" | "createdAt" | "lastLoginAt"
>;

/** Strips fields that must never leave the server (passwordHash, etc). */
function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

function requestMeta() {
  return {
    ipAddress: getRequestIP({ xForwardedFor: true }),
    userAgent: getRequestHeader("user-agent"),
  };
}

/**
 * Creates a new session row and sets the session cookie on the current
 * response. The cookie carries only an opaque, unguessable token — never
 * the user id, role, or any other data.
 */
export async function createSession(userId: string): Promise<void> {
  const token = generateSecureToken();
  const maxAgeSeconds = getSessionMaxAgeSeconds();
  const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000);
  const meta = requestMeta();

  await db.insert(authSessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  setCookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProductionEnv(),
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

/**
 * Reads the session cookie (if any), validates it against the database, and
 * returns the safe user record. Returns `null` for any invalid, expired, or
 * missing session — callers that require a specific status/role layer their
 * own checks on top (see `src/lib/auth/authorization.server.ts`).
 */
export async function getSessionUser(): Promise<SafeUser | null> {
  const token = getCookie(SESSION_COOKIE_NAME);
  if (!token) return null;

  const tokenHash = hashToken(token);

  const [session] = await db
    .select()
    .from(authSessions)
    .where(and(eq(authSessions.tokenHash, tokenHash), gt(authSessions.expiresAt, new Date())))
    .limit(1);

  if (!session) return null;

  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user) return null;

  // Best-effort activity timestamp — not worth failing the request over.
  void db
    .update(authSessions)
    .set({ lastUsedAt: new Date() })
    .where(eq(authSessions.id, session.id))
    .catch(() => undefined);

  return toSafeUser(user);
}

export interface SessionContext {
  user: SafeUser;
  sessionId: string;
}

/**
 * Like `getSessionUser`, but also returns the session row id and rejects
 * blocked accounts, and performs NO writes. Used to authenticate the
 * long-lived realtime stream: identity comes only from the httpOnly session
 * cookie, never from a query parameter.
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const token = getCookie(SESSION_COOKIE_NAME);
  if (!token) return null;

  const [row] = await db
    .select({ session: authSessions, user: users })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(
      and(eq(authSessions.tokenHash, hashToken(token)), gt(authSessions.expiresAt, new Date())),
    )
    .limit(1);

  if (!row) return null;
  if (row.user.status === "SUSPENDED" || row.user.status === "DEACTIVATED") return null;
  return { user: toSafeUser(row.user), sessionId: row.session.id };
}

/**
 * Cheap re-check used periodically while a stream is open, so a session that
 * expired or was revoked (or whose account was blocked) cannot stay
 * authorized indefinitely — even if the revocation happened on another
 * app instance and the in-process close hook never ran.
 */
export async function isSessionStillValid(sessionId: string): Promise<boolean> {
  const [row] = await db
    .select({ status: users.status })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(and(eq(authSessions.id, sessionId), gt(authSessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return false;
  return row.status !== "SUSPENDED" && row.status !== "DEACTIVATED";
}

/** Deletes the current session (if any) and clears the cookie. */
export async function destroyCurrentSession(): Promise<void> {
  const token = getCookie(SESSION_COOKIE_NAME);
  if (token) {
    const deleted = await db
      .delete(authSessions)
      .where(eq(authSessions.tokenHash, hashToken(token)))
      .returning({ id: authSessions.id });
    for (const row of deleted) revokeRealtimeForSession(row.id, "logout");
  }
  deleteCookie(SESSION_COOKIE_NAME, { path: "/" });
}

/**
 * Invalidates every session for a user — used after a password reset/change
 * so a stolen session can't outlive a password the user just rotated.
 */
export async function destroyAllSessionsForUser(userId: string): Promise<void> {
  await db.delete(authSessions).where(eq(authSessions.userId, userId));
  revokeRealtimeForUser(userId, "sessions-revoked");
}
