import "@tanstack/react-start/server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { doctors, passwordResetTokens, patientProfiles, users } from "@/db/schema";
import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from "@/lib/validation/auth";

import { recordAuthAuditEvent } from "./audit.server";
import { AuthError } from "./errors";
import { getSessionMaxAgeSeconds } from "./env.server";
import { sendMailSafely } from "./mailer.server";
import { getPasswordStrengthIssues, hashPassword, verifyPassword } from "./password.server";
import { AUTH_RATE_LIMITS, checkRateLimit } from "./rate-limit.server";
import { dashboardPathForRole } from "./roles";
import { createSession, destroyAllSessionsForUser, destroyCurrentSession } from "./session.server";
import { generateSecureToken, hashToken } from "./tokens.server";

// A statically precomputed Argon2id hash (not a real credential — the
// plaintext is a fixed constant with no matching account). Verifying
// against it when a login's email isn't found keeps the response time for
// "no such account" close to "wrong password", so response timing alone
// doesn't tell an attacker whether an email is registered.
const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$twciT8fuchsoCdJD3OjZfw$lMclfUHRItZlR1IplUl6ANxrPYhKvbvurIlvPKhgQ+I";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function assertRateLimit(name: keyof typeof AUTH_RATE_LIMITS, key: string) {
  const { limit, windowSeconds } = AUTH_RATE_LIMITS[name];
  const result = checkRateLimit(`${name}:${key}`, limit, windowSeconds);
  if (!result.allowed) {
    throw new AuthError(
      `Too many attempts. Please try again in ${Math.ceil(result.retryAfterSeconds / 60) || 1} minute(s).`,
    );
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function generateUniqueDoctorSlug(firstName: string, lastName: string): Promise<string> {
  const base = slugify(`dr-${firstName}-${lastName}`) || "doctor";
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const [existing] = await db
      .select({ id: doctors.id })
      .from(doctors)
      .where(eq(doctors.slug, candidate))
      .limit(1);
    if (!existing) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export interface AuthResult {
  role: (typeof users.$inferSelect)["role"];
  dashboardPath: string;
}

/**
 * Registers a new account. Only PATIENT accounts become immediately
 * ACTIVE — DOCTOR and HOSPITAL_ADMIN self-registrations start out
 * PENDING_VERIFICATION so an unverified provider can't be mistaken for a
 * trusted one (see `requireVerifiedDoctor`/`requireVerifiedHospital` in
 * `authorization.server.ts`). ADMIN is never accepted here.
 */
export async function registerUser(
  input: RegisterInput,
  rateLimitKey: string,
): Promise<AuthResult> {
  assertRateLimit("register", rateLimitKey);

  const strengthIssues = getPasswordStrengthIssues(input.password);
  if (strengthIssues.length > 0) {
    throw new AuthError(strengthIssues[0] ?? "Password does not meet the minimum requirements.");
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);
  if (existing) {
    // Deliberately generic — registration is a case where confirming an
    // email already has an account is normal UX (unlike login), but we
    // still avoid saying anything about *why* (e.g. its current status).
    throw new AuthError("An account with that email already exists.");
  }

  const passwordHash = await hashPassword(input.password);
  const initialStatus = input.role === "PATIENT" ? "ACTIVE" : "PENDING_VERIFICATION";

  const [user] = await db
    .insert(users)
    .values({ email: input.email, passwordHash, role: input.role, status: initialStatus })
    .returning();

  if (!user) throw new AuthError("Could not create account. Please try again.");

  if (input.role === "PATIENT") {
    await db.insert(patientProfiles).values({
      userId: user.id,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
    });
  } else if (input.role === "DOCTOR") {
    const slug = await generateUniqueDoctorSlug(input.firstName, input.lastName);
    await db.insert(doctors).values({
      userId: user.id,
      firstName: input.firstName,
      lastName: input.lastName,
      slug,
      verificationStatus: "PENDING",
      isAvailable: false,
    });
  }
  // HOSPITAL_ADMIN: no hospital record is created here — associating a
  // hospital-admin account with a specific hospital is modeled in a later
  // phase. The account's PENDING_VERIFICATION status is what gates it
  // until a platform admin approves it (see known limitations in the
  // Phase 3 report).

  await createSession(user.id);
  await recordAuthAuditEvent({
    actorUserId: user.id,
    action: "REGISTER",
    metadata: { role: user.role },
  });

  return { role: user.role, dashboardPath: dashboardPathForRole(user.role) };
}

export async function loginUser(input: LoginInput, rateLimitKey: string): Promise<AuthResult> {
  assertRateLimit("login", rateLimitKey);

  const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);

  // Always verify against *some* hash — real or dummy — so a nonexistent
  // account doesn't return measurably faster than a wrong password does.
  const passwordValid = await verifyPassword(
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    input.password,
  );

  if (!user || !passwordValid) {
    await recordAuthAuditEvent({
      actorUserId: user?.id ?? null,
      action: "LOGIN_FAILED",
      metadata: { email: input.email },
    });
    throw new AuthError("Invalid email or password.");
  }

  if (user.status === "SUSPENDED" || user.status === "DEACTIVATED") {
    await recordAuthAuditEvent({
      actorUserId: user.id,
      action: "LOGIN_FAILED",
      metadata: { reason: "account_status", status: user.status },
    });
    throw new AuthError(
      user.status === "SUSPENDED"
        ? "Your account has been suspended. Contact support for assistance."
        : "This account has been deactivated.",
    );
  }

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await createSession(user.id);
  await recordAuthAuditEvent({ actorUserId: user.id, action: "LOGIN_SUCCESS" });

  return { role: user.role, dashboardPath: dashboardPathForRole(user.role) };
}

export async function logoutCurrentUser(actorUserId: string | null): Promise<void> {
  await destroyCurrentSession();
  if (actorUserId) {
    await recordAuthAuditEvent({ actorUserId, action: "LOGOUT" });
  }
}

/**
 * Always resolves the same way regardless of whether the email exists —
 * callers must return the same neutral message either way to avoid account
 * enumeration. Silently no-ops (after the rate-limit check) if there's no
 * matching account.
 */
export async function requestPasswordReset(
  input: ForgotPasswordInput,
  rateLimitKey: string,
): Promise<void> {
  assertRateLimit("forgotPassword", rateLimitKey);

  const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  if (!user) return;

  const rawToken = generateSecureToken();
  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
  });

  await recordAuthAuditEvent({ actorUserId: user.id, action: "PASSWORD_RESET_REQUESTED" });

  const appUrl = process.env["APP_URL"] ?? "http://localhost:3000";
  const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;

  await sendMailSafely({
    to: user.email,
    subject: "Reset your Medix password",
    text: `We received a request to reset your Medix password.\n\nReset it here (valid for 1 hour):\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
  });
}

export async function resetPassword(
  input: ResetPasswordInput,
  rateLimitKey: string,
): Promise<void> {
  assertRateLimit("resetPassword", rateLimitKey);

  const strengthIssues = getPasswordStrengthIssues(input.password);
  if (strengthIssues.length > 0) {
    throw new AuthError(strengthIssues[0] ?? "Password does not meet the minimum requirements.");
  }

  const tokenHash = hashToken(input.token);
  const [tokenRow] = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);

  if (!tokenRow || tokenRow.usedAt || tokenRow.expiresAt.getTime() < Date.now()) {
    throw new AuthError("This password reset link is invalid or has expired.");
  }

  const passwordHash = await hashPassword(input.password);

  await db.update(users).set({ passwordHash }).where(eq(users.id, tokenRow.userId));
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, tokenRow.id));

  // A stolen session shouldn't survive a password the user just rotated.
  await destroyAllSessionsForUser(tokenRow.userId);

  await recordAuthAuditEvent({ actorUserId: tokenRow.userId, action: "PASSWORD_RESET_COMPLETED" });
}

// Re-exported for callers that only need the max-age value (e.g. UI copy
// like "you'll stay signed in for N days").
export { getSessionMaxAgeSeconds };
