/**
 * Idempotent fixtures for the browser E2E suite. Runs ONLY behind
 * tests/support/preload.ts (fail-closed test-database guard). Adds, on top of
 * `npm run db:seed`:
 *   - Patient B  (TEST_PATIENT_B_EMAIL) with a CONFIRMED appointment with Dr. Sara Khan
 *   - a platform ADMIN (TEST_ADMIN_EMAIL)
 *   - conversation A: Tariq <-> Dr. Ahmed Raza   (seeded appointments already make them eligible)
 *   - conversation B: Patient B <-> Dr. Sara Khan
 * Writes the two conversation ids to TEST_FIXTURES_FILE (default .test-run/fixtures.json).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { and, eq } from "drizzle-orm";

import { db } from "../../src/db";
import {
  appointments,
  conversationParticipants,
  conversations,
  doctors,
  patientProfiles,
  users,
} from "../../src/db/schema";
import { hashPassword } from "../../src/lib/auth/password.server";
import { getTestConfig } from "../../scripts/test/config";

const cfg = getTestConfig();
const PASSWORD = cfg.password;

async function ensureUser(email: string, role: "PATIENT" | "ADMIN") {
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) return existing;
  const [created] = await db
    .insert(users)
    .values({ email, passwordHash: await hashPassword(PASSWORD), role, emailVerified: true })
    .returning();
  return created!;
}

async function ensureConversation(patientId: string, doctorId: string, doctorUserId: string) {
  const [existing] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.patientId, patientId), eq(conversations.doctorId, doctorId)));
  if (existing) return existing;
  const [row] = await db.insert(conversations).values({ patientId, doctorId }).returning();
  await db.insert(conversationParticipants).values([
    { conversationId: row!.id, userId: patientId },
    { conversationId: row!.id, userId: doctorUserId },
  ]);
  return row!;
}

async function main() {
  const [tariq] = await db.select().from(users).where(eq(users.email, cfg.emails.patient));
  const [ahmedUser] = await db.select().from(users).where(eq(users.email, cfg.emails.doctor));
  const [saraUser] = await db.select().from(users).where(eq(users.email, cfg.emails.doctorB));
  const [ahmed] = await db.select().from(doctors).where(eq(doctors.userId, ahmedUser!.id));
  const [sara] = await db.select().from(doctors).where(eq(doctors.userId, saraUser!.id));

  const patientB = await ensureUser(cfg.emails.patientB, "PATIENT");
  await db
    .insert(patientProfiles)
    .values({
      userId: patientB.id,
      firstName: "Bushra",
      lastName: "Malik",
      city: "Lahore",
      country: "Pakistan",
    })
    .onConflictDoNothing();

  const [hasAppt] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(and(eq(appointments.patientId, patientB.id), eq(appointments.doctorId, sara!.id)));
  if (!hasAppt) {
    await db.insert(appointments).values({
      patientId: patientB.id,
      doctorId: sara!.id,
      appointmentDate: new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10),
      startTime: "12:00",
      endTime: "12:30",
      consultationType: "ONLINE",
      reasonForVisit: "Fixture appointment",
      status: "CONFIRMED",
    });
  }

  await ensureUser(cfg.emails.admin, "ADMIN");

  const convA = await ensureConversation(tariq!.id, ahmed!.id, ahmedUser!.id);
  const convB = await ensureConversation(patientB.id, sara!.id, saraUser!.id);
  const out = { convA: convA.id, convB: convB.id };
  mkdirSync(path.dirname(cfg.fixturesFile), { recursive: true });
  writeFileSync(cfg.fixturesFile, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out));
  process.exit(0);
}

void main();
