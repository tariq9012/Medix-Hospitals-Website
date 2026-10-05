import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "./src/db";
import { appointments, doctors, users, hospitals } from "./src/db/schema";
async function main() {
  const [du] = await db.select().from(users).where(eq(users.email,"dr.ahmed.raza@medix.example"));
  const [d] = await db.select().from(doctors).where(eq(doctors.userId, du.id));
  const [patient] = await db.select().from(users).where(eq(users.email,"tariq.khan@example.com"));
  const [hospital] = await db.select().from(hospitals).limit(1);
  const [created] = await db.insert(appointments).values({
    patientId: patient.id,
    doctorId: d.id,
    hospitalId: hospital?.id ?? null,
    appointmentDate: "2026-08-20",
    startTime: "10:00",
    endTime: "10:30",
    type: "IN_PERSON",
    status: "COMPLETED",
    reasonForVisit: "Fresh completed appointment for testing",
  }).returning();
  console.log("Created:", created.id);
  process.exit(0);
}
main();
