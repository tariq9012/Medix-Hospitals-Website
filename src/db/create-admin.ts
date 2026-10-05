/**
 * Creates a single ADMIN account. There is no public admin-registration
 * endpoint anywhere in the app — this script is the only way to create one.
 *
 * Usage (recommended — avoids the password being visible on screen):
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='...' npm run admin:create
 *
 * If either variable is missing, you'll be prompted for it interactively.
 * Nothing is ever hardcoded — there is no default admin password.
 */
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { eq } from "drizzle-orm";

import { db } from "./index";
import { users } from "./schema";
import { getPasswordStrengthIssues, hashPassword } from "../lib/auth/password.server";

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

async function main() {
  if (process.env["NODE_ENV"] === "production" && process.env["ALLOW_ADMIN_CREATE"] !== "true") {
    console.error(
      "Refusing to run in production without ALLOW_ADMIN_CREATE=true set explicitly. " +
        "This is a safety check, not a real barrier — only run this against a database " +
        "and network you trust.",
    );
    process.exit(1);
  }

  const email = (process.env["ADMIN_EMAIL"] ?? (await prompt("Admin email: ")))
    .trim()
    .toLowerCase();

  if (!email || !email.includes("@")) {
    console.error("A valid email is required.");
    process.exit(1);
  }

  const passwordFromEnv = process.env["ADMIN_PASSWORD"];
  if (!passwordFromEnv) {
    console.warn(
      "No ADMIN_PASSWORD env var set — the password you type next will be visible on screen. " +
        "Prefer passing ADMIN_PASSWORD as an environment variable instead.",
    );
  }
  const password = passwordFromEnv ?? (await prompt("Admin password: "));

  const issues = getPasswordStrengthIssues(password);
  if (issues.length > 0) {
    console.error("Password does not meet requirements:");
    for (const issue of issues) console.error(` - ${issue}`);
    process.exit(1);
  }

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) {
    console.error(`An account with ${email} already exists. Choose a different email.`);
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  await db.insert(users).values({
    email,
    passwordHash,
    role: "ADMIN",
    status: "ACTIVE",
    emailVerified: true,
  });

  console.log(`✅ Admin account created for ${email}.`);
}

main()
  .catch((error) => {
    console.error("Failed to create admin account:", error);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
