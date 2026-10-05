/**
 * TEST HELPER (local databases only): creates a real auth_sessions row for an existing user, exactly as a login
 * would, and prints the raw cookie token. Used by the Playwright E2E scripts so they don't hit the login rate limiter.
 * Usage: npx tsx tests/e2e/mint-session.mts <email>
 */
import "dotenv/config";

import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "../../src/db";
import { authSessions, users } from "../../src/db/schema";
import { hashToken } from "../../src/lib/auth/tokens.server";

if (!/@(localhost|127\.0\.0\.1):/.test(process.env["DATABASE_URL"] ?? "")) {
  console.error("Refusing to mint sessions on a non-local database.");
  process.exit(1);
}
const [user] = await db.select().from(users).where(eq(users.email, process.argv[2] ?? ""));
if (!user) {
  console.error("No such user");
  process.exit(1);
}
const token = randomBytes(32).toString("base64url");
await db.insert(authSessions).values({
  userId: user.id,
  tokenHash: hashToken(token),
  expiresAt: new Date(Date.now() + 3600_000),
});
console.log(token);
process.exit(0);
