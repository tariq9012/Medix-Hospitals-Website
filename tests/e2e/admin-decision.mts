/**
 * TEST HELPER: applies a REAL admin verification decision through the production service
 * (same code path as the Admin Portal). Run ONLY behind tests/support/preload.ts (fail-closed test-DB guard), as tests/e2e/common.py run_ts() does.
 * Usage: tsx --import ./tests/support/preload.ts tests/e2e/admin-decision.mts <DOCTOR|HOSPITAL> <id> <ACTION> [reason]
 */
import { eq } from "drizzle-orm";

import { db } from "../../src/db";
import { users } from "../../src/db/schema";
import { applyProviderVerificationDecision } from "../../src/lib/admin/verification.server";

const [type, id, action, reason] = process.argv.slice(2);
const [admin] = await db.select().from(users).where(eq(users.role, "ADMIN")).limit(1);
if (!admin) throw new Error("No ADMIN user — create one first.");
const r = await applyProviderVerificationDecision(admin.id, {
  providerType: type,
  providerId: id,
  action,
  reason,
} as never);
console.log(JSON.stringify(r));
process.exit(0);
