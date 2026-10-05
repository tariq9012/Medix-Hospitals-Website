import "dotenv/config";
import { eq, and } from "drizzle-orm";
import { db } from "./src/db";
import { appointments, doctors, users, medicalRecords } from "./src/db/schema";
async function main() {
  const [du] = await db.select().from(users).where(eq(users.email,"dr.ahmed.raza@medix.example"));
  const [d] = await db.select().from(doctors).where(eq(doctors.userId, du.id));
  const rows = await db.select().from(appointments).where(and(eq(appointments.doctorId,d.id), eq(appointments.status,"COMPLETED")));
  for (const r of rows) {
    const [rec] = await db.select().from(medicalRecords).where(eq(medicalRecords.appointmentId, r.id));
    console.log(r.id, r.appointmentDate, "hasRecord:", Boolean(rec));
  }
  process.exit(0);
}
main();
