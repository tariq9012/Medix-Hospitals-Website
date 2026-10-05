import "@tanstack/react-start/server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db";
import { getSessionSecret } from "@/lib/auth/env.server";
import { validateServerEnv } from "@/lib/env.server";

const DB_TIMEOUT_MS = 3_000;

/**
 * Readiness = "this instance can serve real traffic": configuration is valid
 * AND PostgreSQL answers a trivial query within a short timeout. The caller
 * only ever exposes a generic ok/unavailable — the reason is logged
 * server-side (sanitised) and never sent to the client.
 */
export async function checkReadiness(): Promise<{ ready: boolean; reason?: string }> {
  const { errors } = validateServerEnv(process.env);
  if (errors.length > 0) return { ready: false, reason: "configuration invalid" };
  try {
    getSessionSecret(); // throws in production when missing/weak
  } catch {
    return { ready: false, reason: "session secret invalid" };
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("database check timed out")), DB_TIMEOUT_MS);
      }),
    ]);
    return { ready: true };
  } catch (error) {
    console.error("[health] database not ready:", error);
    return { ready: false, reason: "database unavailable" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
