import "dotenv/config";
import { eq, and } from "drizzle-orm";
import { db } from "./src/db";
import { appointments, doctors, users } from "./src/db/schema";
async function main() {
  const [du] = await db.select().from(users).where(eq(users.email,"dr.ahmed.raza@medix.example"));
  const [d] = await db.select().from(doctors).where(eq(doctors.userId, du.id));
  const rows = await db.select().from(appointments).where(and(eq(appointments.doctorId,d.id), eq(appointments.status,"COMPLETED")));
  console.log(JSON.stringify(rows.map(r=>({id:r.id,status:r.status,date:r.appointmentDate})), null, 2));
  process.exit(0);
}
main();
