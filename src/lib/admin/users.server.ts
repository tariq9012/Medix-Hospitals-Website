import "@tanstack/react-start/server-only";

import { and, count, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { authSessions, users } from "@/db/schema";
import { recordAuthAuditEvent } from "@/lib/auth/audit.server";
import { revokeRealtimeForUser } from "@/lib/realtime/events.server";
import type { AdminUserStatusActionInput } from "@/lib/validation/admin";

import { AdminError } from "./verification.server";

/**
 * Suspends or reactivates a user account.
 *
 * Account status and *provider verification* are deliberately separate
 * concepts: reactivating a suspended account restores sign-in, but does NOT
 * silently restore a doctor's `APPROVED` verification — that requires its
 * own explicit admin decision (see `verification.server.ts`).
 *
 * Suspension deletes the target's sessions inside the same transaction as
 * the status change, so an already-signed-in user loses access immediately
 * rather than at their next login. (Phase 3's `getCurrentUser()` also
 * rejects non-ACTIVE accounts on every request, so this is belt-and-braces.)
 */
export async function applyUserStatusAction(
  adminUserId: string,
  input: AdminUserStatusActionInput,
): Promise<void> {
  if (input.userId === adminUserId) {
    throw new AdminError("You can't change the status of your own account.");
  }

  const [target] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!target) throw new AdminError("User not found.");

  if (input.action === "SUSPEND") {
    if (target.status === "SUSPENDED") {
      throw new AdminError("This account is already suspended.");
    }

    // Never allow the platform to be locked out of its own admin surface.
    if (target.role === "ADMIN") {
      const [{ value: otherActiveAdmins }] = await db
        .select({ value: count() })
        .from(users)
        .where(and(eq(users.role, "ADMIN"), eq(users.status, "ACTIVE"), ne(users.id, target.id)));

      if (otherActiveAdmins === 0) {
        throw new AdminError(
          "This is the last active admin account — suspending it would lock everyone out of the admin portal.",
        );
      }
    }

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ status: "SUSPENDED", updatedAt: new Date() })
        .where(eq(users.id, input.userId));
      // Revoke every active session so the suspension takes effect now.
      await tx.delete(authSessions).where(eq(authSessions.userId, input.userId));
    });
    // The transaction has committed: also tear down any live realtime streams now.
    revokeRealtimeForUser(input.userId, "account-suspended");

    await recordAuthAuditEvent({
      actorUserId: adminUserId,
      action: "ADMIN_USER_SUSPENDED",
      entityId: input.userId,
      metadata: {
        previousStatus: target.status,
        role: target.role,
        hasReason: Boolean(input.reason),
      },
    });
    return;
  }

  if (target.status !== "SUSPENDED") {
    throw new AdminError("Only a suspended account can be reactivated.");
  }

  await db
    .update(users)
    .set({ status: "ACTIVE", updatedAt: new Date() })
    .where(eq(users.id, input.userId));

  await recordAuthAuditEvent({
    actorUserId: adminUserId,
    action: "ADMIN_USER_REACTIVATED",
    entityId: input.userId,
    metadata: { previousStatus: target.status, role: target.role },
  });
}
