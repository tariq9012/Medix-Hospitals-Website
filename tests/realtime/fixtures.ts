/**
 * Idempotent LOCAL/TEST fixtures for Phase 11 verification. Refuses to run
 * against anything but a localhost database. Adds, on top of `npm run db:seed`:
 *   - Patient B  (patient.b@example.com) with a CONFIRMED appointment with Dr. Sara Khan
 *   - a platform ADMIN (platform.admin@medix.example)
 *   - conversation A: Tariq <-> Dr. Ahmed Raza   (seeded appointments already make them eligible)
 *   - conversation B: Patient B <-> Dr. Sara Khan
 * Prints the two conversation ids as JSON.
 */
import "dotenv/config";

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

const url = process.env["DATABASE_URL"] ?? "";
if (!/@(localhost|127\.0\.0\.1):/.test(url)) {
  console.error("Refusing to create fixtures on a non-local database.");
  process.exit(1);
}

const PASSWORD = "MedixDev#2026";

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
  const [tariq] = await db.select().from(users).where(eq(users.email, "tariq.khan@example.com"));
  const [ahmedUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, "dr.ahmed.raza@medix.example"));
  const [saraUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, "dr.sara.khan@medix.example"));
  const [ahmed] = await db.select().from(doctors).where(eq(doctors.userId, ahmedUser!.id));
  const [sara] = await db.select().from(doctors).where(eq(doctors.userId, saraUser!.id));

  const patientB = await ensureUser("patient.b@example.com", "PATIENT");
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

  await ensureUser("platform.admin@medix.example", "ADMIN");

  const convA = await ensureConversation(tariq!.id, ahmed!.id, ahmedUser!.id);
  const convB = await ensureConversation(patientB.id, sara!.id, saraUser!.id);
  console.log(JSON.stringify({ convA: convA.id, convB: convB.id }));
  process.exit(0);
}

void main();
