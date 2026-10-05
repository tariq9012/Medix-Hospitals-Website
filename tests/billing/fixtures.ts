import { eq } from "drizzle-orm";

import { db } from "../../src/db";
import { appointments, doctors, hospitals, users } from "../../src/db/schema";
import { hashPassword } from "../../src/lib/auth/password.server";
import { getTestConfig } from "../../scripts/test/config";

const PASSWORD = getTestConfig().password;

async function ensureUser(email: string, role: "PATIENT" | "DOCTOR" | "HOSPITAL_ADMIN") {
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) return existing;
  const [created] = await db
    .insert(users)
    .values({
      email,
      passwordHash: await hashPassword(PASSWORD),
      role,
      emailVerified: true,
      status: "ACTIVE",
    })
    .returning();
  return created!;
}

async function ensureHospital(slug: string, name: string) {
  const [existing] = await db.select().from(hospitals).where(eq(hospitals.slug, slug));
  if (existing) return existing;
  const [created] = await db
    .insert(hospitals)
    .values({
      slug,
      name,
      city: "Karachi",
      country: "Pakistan",
      address: "1 Test Rd",
      phone: "+92-300-0000000",
      email: `${slug}@example.com`,
      verificationStatus: "APPROVED",
    })
    .returning();
  return created!;
}

async function ensureDoctor(userEmail: string, fee: string) {
  const user = await ensureUser(userEmail, "DOCTOR");
  const [existing] = await db.select().from(doctors).where(eq(doctors.userId, user.id));
  if (existing) return existing;
  const [created] = await db
    .insert(doctors)
    .values({
      userId: user.id,
      firstName: "Billing",
      lastName: "TestDoctor",
      slug: `billing-test-doctor-${RUN}`,
      medicalLicenseNumber: `TEST-${RUN}`,
      yearsOfExperience: 5,
      consultationFee: fee,
      verificationStatus: "APPROVED",
      biography: "Fixture doctor for billing tests.",
    })
    .returning();
  return created!;
}

let slotCounter = 0;

/** A fresh CONFIRMED appointment (bypassing the doctor-UI action — these tests target the service layer directly), with a fee snapshot frozen at creation time. Each call gets its own time slot so tests never collide on the doctor's unique (doctor, date, time) booking constraint. */
export async function makeConfirmedAppointment(opts: {
  patientEmail: string;
  doctorId: string;
  hospitalId: string | null;
  fee: string;
  reason: string;
}) {
  const patient = await ensureUser(opts.patientEmail, "PATIENT");
  const today = new Date().toISOString().slice(0, 10);
  slotCounter += 1;
  const hour = 6 + Math.floor(slotCounter / 60);
  const minute = slotCounter % 60;
  const startTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const endMinute = minute + 30 >= 60 ? minute - 30 : minute + 30;
  const endHour = minute + 30 >= 60 ? hour + 1 : hour;
  const endTime = `${String(endHour).padStart(2, "0")}:${String(endMinute).padStart(2, "0")}`;
  const [appt] = await db
    .insert(appointments)
    .values({
      patientId: patient.id,
      doctorId: opts.doctorId,
      hospitalId: opts.hospitalId,
      appointmentDate: today,
      startTime,
      endTime,
      consultationType: "IN_PERSON",
      reasonForVisit: opts.reason,
      status: "CONFIRMED",
      paymentStatus: "PENDING",
      fee: opts.fee,
    })
    .returning();
  return { appointment: appt!, patient };
}

/**
 * Unique per process so the suite is re-runnable against the same test
 * database: a reused doctor would collide with the previous run's
 * (doctor, date, start_time) double-booking constraint.
 */
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

export async function setup() {
  const hospitalA = await ensureHospital(
    `billing-test-hospital-a-${RUN}`,
    "Billing Test Hospital A",
  );
  const hospitalB = await ensureHospital(
    `billing-test-hospital-b-${RUN}`,
    "Billing Test Hospital B",
  );
  const hospitalAdminA = await ensureUser(`billing.admin.a.${RUN}@example.com`, "HOSPITAL_ADMIN");
  const hospitalAdminB = await ensureUser(`billing.admin.b.${RUN}@example.com`, "HOSPITAL_ADMIN");
  const doctor = await ensureDoctor(`billing.doctor.${RUN}@example.com`, "3000.00");
  return { hospitalA, hospitalB, hospitalAdminA, hospitalAdminB, doctor };
}
