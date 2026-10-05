import { eq } from "drizzle-orm";

import { db } from "../../src/db";
import {
  appointments,
  doctorAvailability,
  doctors,
  doctorSpecialties,
  hospitalDoctors,
  hospitals,
  hospitalSpecialties,
  patientProfiles,
  specialties,
  users,
} from "../../src/db/schema";
import { hashPassword } from "../../src/lib/auth/password.server";
import { getTestConfig } from "../../scripts/test/config";

/** Unique per test run so fixtures never collide with seed data or earlier runs. */
export const RUN = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
let counter = 0;
const next = () => ++counter;
let hash: string | undefined;

export async function mkUser(
  role: "PATIENT" | "DOCTOR" | "HOSPITAL_ADMIN" | "ADMIN",
  label: string,
) {
  hash ??= await hashPassword(getTestConfig().password);
  const [u] = await db
    .insert(users)
    .values({
      email: `p13.${label}.${RUN}.${next()}@example.com`,
      passwordHash: hash,
      role,
      emailVerified: true,
      status: "ACTIVE",
    })
    .returning();
  return u!;
}

export async function mkPatient(first = "Pat", last = "Tester") {
  const u = await mkUser("PATIENT", "patient");
  await db.insert(patientProfiles).values({ userId: u.id, firstName: first, lastName: last });
  return u;
}

export async function mkSpecialty(label = "spec") {
  const n = next();
  const [s] = await db
    .insert(specialties)
    .values({ name: `P13 ${label} ${RUN} ${n}`, slug: `p13-${label}-${RUN}-${n}` })
    .returning();
  return s!;
}

export async function mkHospital(
  opts: {
    name?: string;
    city?: string;
    status?: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
    specialtyId?: string;
  } = {},
) {
  const n = next();
  const [h] = await db
    .insert(hospitals)
    .values({
      name: opts.name ?? `P13 Hospital ${RUN} ${n}`,
      slug: `p13-hospital-${RUN}-${n}`,
      city: opts.city ?? "Karachi",
      country: "Pakistan",
      address: "1 Fixture Road",
      email: "hospital-contact@example.com",
      verificationStatus: opts.status ?? "APPROVED",
      verificationReason:
        opts.status && opts.status !== "APPROVED" ? "internal-reason-secret" : null,
    })
    .returning();
  if (opts.specialtyId) {
    await db
      .insert(hospitalSpecialties)
      .values({ hospitalId: h!.id, specialtyId: opts.specialtyId });
  }
  return h!;
}

export async function mkDoctor(opts: {
  token: string; // unique last name so a search isolates this fixture group
  status?: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
  userStatus?: "ACTIVE" | "SUSPENDED";
  isAvailable?: boolean;
  fee?: string | null;
  years?: number | null;
  qualifications?: string[];
  specialtyId?: string;
  hospitalId?: string;
  availability?: "ONLINE" | "IN_PERSON" | "BOTH" | "NONE";
  first?: string;
}) {
  const user = await mkUser("DOCTOR", "doctor");
  if (opts.userStatus)
    await db.update(users).set({ status: opts.userStatus }).where(eq(users.id, user.id));
  const n = next();
  const [d] = await db
    .insert(doctors)
    .values({
      userId: user.id,
      firstName: opts.first ?? `First${n}`,
      lastName: opts.token,
      slug: `p13-doc-${RUN}-${n}`,
      medicalLicenseNumber: `LIC-SECRET-${RUN}-${n}`,
      verificationStatus: opts.status ?? "APPROVED",
      verificationReason:
        opts.status && opts.status !== "APPROVED" ? "internal-reason-secret" : null,
      isAvailable: opts.isAvailable ?? true,
      consultationFee: opts.fee === undefined ? "2000.00" : opts.fee,
      yearsOfExperience: opts.years === undefined ? 5 : opts.years,
      qualifications: opts.qualifications ?? ["MBBS"],
      // Deliberately fake denormalized values: the public API must NEVER use them.
      rating: "4.90",
      totalReviews: 999,
    })
    .returning();
  if (opts.specialtyId) {
    await db
      .insert(doctorSpecialties)
      .values({ doctorId: d!.id, specialtyId: opts.specialtyId, isPrimary: true });
  }
  if (opts.hospitalId) {
    await db
      .insert(hospitalDoctors)
      .values({ hospitalId: opts.hospitalId, doctorId: d!.id, isPrimary: true });
  }
  const mode = opts.availability ?? "IN_PERSON";
  if (mode !== "NONE") {
    const types = mode === "BOTH" ? (["IN_PERSON", "ONLINE"] as const) : ([mode] as const);
    for (const t of types) {
      await db.insert(doctorAvailability).values({
        doctorId: d!.id,
        hospitalId: t === "IN_PERSON" ? opts.hospitalId : undefined,
        dayOfWeek: "MONDAY",
        startTime: "09:00",
        endTime: "12:00",
        slotDurationMinutes: 30,
        consultationType: t,
      });
    }
  }
  return { doctor: d!, user };
}

let slot = 0;
export async function mkAppointment(opts: {
  patientId: string;
  doctorId: string;
  hospitalId: string | null;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
}) {
  // Unique (doctor, date, start) per call to satisfy the double-booking index.
  slot += 1;
  const start = `${String(8 + (slot % 10)).padStart(2, "0")}:${slot % 2 ? "00" : "30"}`;
  const [a] = await db
    .insert(appointments)
    .values({
      patientId: opts.patientId,
      doctorId: opts.doctorId,
      hospitalId: opts.hospitalId,
      appointmentDate: `2026-0${1 + (slot % 8)}-${String(10 + (slot % 18)).padStart(2, "0")}`,
      startTime: start,
      endTime: start,
      consultationType: "IN_PERSON",
      status: opts.status,
      fee: "2000.00",
    })
    .returning();
  return a!;
}

export async function closeDb() {
  const { client } = await import("../../src/db");
  await client.end();
}

/** Counts SQL statements executed while `fn` runs (postgres.js debug hook). */
export async function countQueries<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; queries: number }> {
  const { client } = await import("../../src/db");
  const opts = client.options as unknown as { debug?: unknown };
  const previous = opts.debug;
  let queries = 0;
  opts.debug = () => {
    queries += 1;
  };
  try {
    const result = await fn();
    return { result, queries };
  } finally {
    opts.debug = previous;
  }
}
