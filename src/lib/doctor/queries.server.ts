import "@tanstack/react-start/server-only";

import { and, count, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  appointments,
  doctors,
  hospitalDoctors,
  hospitals,
  patientProfiles,
  users,
  type Appointment,
  type Doctor,
} from "@/db/schema";
import { redirect } from "@tanstack/react-router";

import { requireRole } from "@/lib/auth/authorization.server";

/**
 * Resolves the authenticated session to the caller's OWN doctor record.
 * `doctorId` is never taken from the client for ownership purposes anywhere
 * in this module — every query below starts from this resolved id.
 */
export async function requireDoctorRecord(): Promise<Doctor> {
  const user = await requireRole("DOCTOR");
  const [doctor] = await db.select().from(doctors).where(eq(doctors.userId, user.id)).limit(1);
  if (!doctor) {
    // A DOCTOR-role user with no doctor row is a data-integrity problem, not
    // a normal "wrong role" case — treat it the same as unauthenticated.
    throw redirect({ to: "/login" });
  }
  return doctor;
}

/**
 * Same as {@link requireDoctorRecord}, but also requires the provider to be
 * APPROVED. Every operational action (managing appointments, availability)
 * must use this — profile viewing/editing may use the unverified variant
 * above, since a not-yet-verified doctor should still be able to complete
 * their profile.
 */
export async function requireVerifiedDoctorRecord(): Promise<Doctor> {
  const doctor = await requireDoctorRecord();
  if (doctor.verificationStatus !== "APPROVED") {
    throw redirect({ to: "/unauthorized" });
  }
  return doctor;
}

export interface DoctorAppointmentRow extends Appointment {
  patientFirstName: string;
  patientLastName: string;
  hospitalName: string | null;
}

async function selectDoctorAppointments(doctorId: string, extra?: ReturnType<typeof eq>) {
  return db
    .select({
      appointment: appointments,
      patientFirstName: patientProfiles.firstName,
      patientLastName: patientProfiles.lastName,
      hospitalName: hospitals.name,
    })
    .from(appointments)
    .innerJoin(users, eq(users.id, appointments.patientId))
    .leftJoin(patientProfiles, eq(patientProfiles.userId, appointments.patientId))
    .leftJoin(hospitals, eq(hospitals.id, appointments.hospitalId))
    .where(
      extra ? and(eq(appointments.doctorId, doctorId), extra) : eq(appointments.doctorId, doctorId),
    )
    .orderBy(desc(appointments.appointmentDate), desc(appointments.startTime));
}

function mapDoctorAppointmentRow(
  row: Awaited<ReturnType<typeof selectDoctorAppointments>>[number],
): DoctorAppointmentRow {
  return {
    ...row.appointment,
    patientFirstName: row.patientFirstName ?? "Unknown",
    patientLastName: row.patientLastName ?? "Patient",
    hospitalName: row.hospitalName,
  };
}

/** Every appointment for this doctor — never another doctor's, since `doctorId` always comes from `requireDoctorRecord()`. */
export async function listDoctorAppointments(doctorId: string): Promise<DoctorAppointmentRow[]> {
  const rows = await selectDoctorAppointments(doctorId);
  return rows.map(mapDoctorAppointmentRow);
}

/** A single appointment, but only if it belongs to this doctor — ownership is baked into the query, not checked after the fact. */
export async function getOwnedDoctorAppointment(
  doctorId: string,
  appointmentId: string,
): Promise<DoctorAppointmentRow | null> {
  const rows = await selectDoctorAppointments(doctorId, eq(appointments.id, appointmentId));
  const row = rows[0];
  return row ? mapDoctorAppointmentRow(row) : null;
}

function todayLocalDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export interface DoctorDashboardStats {
  todayCount: number;
  upcomingCount: number;
  pendingCount: number;
  completedCount: number;
  totalPatients: number;
  nextAppointment: DoctorAppointmentRow | null;
}

export async function getDoctorDashboardStats(doctorId: string): Promise<DoctorDashboardStats> {
  const today = todayLocalDateString();
  const all = await listDoctorAppointments(doctorId);

  const todaysAppointments = all.filter(
    (a) => a.appointmentDate === today && a.status !== "CANCELLED",
  );
  const upcoming = all
    .filter(
      (a) => (a.status === "PENDING" || a.status === "CONFIRMED") && a.appointmentDate >= today,
    )
    .sort((a, b) =>
      (a.appointmentDate + a.startTime).localeCompare(b.appointmentDate + b.startTime),
    );

  const [{ value: totalPatients }] = await db
    .select({ value: count(sql`distinct ${appointments.patientId}`) })
    .from(appointments)
    .where(eq(appointments.doctorId, doctorId));

  return {
    todayCount: todaysAppointments.length,
    upcomingCount: upcoming.length,
    pendingCount: all.filter((a) => a.status === "PENDING").length,
    completedCount: all.filter((a) => a.status === "COMPLETED").length,
    totalPatients,
    nextAppointment: upcoming[0] ?? null,
  };
}

export interface DoctorPatientSummary {
  patientId: string;
  firstName: string;
  lastName: string;
  totalAppointments: number;
  lastAppointmentDate: string | null;
  nextAppointmentDate: string | null;
}

/**
 * Unique patients who have a legitimate appointment relationship with this
 * doctor — never a global patient directory. A patient with no appointment
 * against this doctor simply never appears here.
 */
export async function listDoctorPatients(doctorId: string): Promise<DoctorPatientSummary[]> {
  const rows = await listDoctorAppointments(doctorId);
  const today = todayLocalDateString();

  const byPatient = new Map<string, DoctorAppointmentRow[]>();
  for (const row of rows) {
    const list = byPatient.get(row.patientId) ?? [];
    list.push(row);
    byPatient.set(row.patientId, list);
  }

  return Array.from(byPatient.entries()).map(([patientId, appts]) => {
    const past = appts
      .filter((a) => a.appointmentDate <= today)
      .sort((a, b) => (a.appointmentDate > b.appointmentDate ? -1 : 1));
    const future = appts
      .filter(
        (a) => a.appointmentDate > today && (a.status === "PENDING" || a.status === "CONFIRMED"),
      )
      .sort((a, b) => (a.appointmentDate < b.appointmentDate ? -1 : 1));
    return {
      patientId,
      firstName: appts[0]!.patientFirstName,
      lastName: appts[0]!.patientLastName,
      totalAppointments: appts.length,
      lastAppointmentDate: past[0]?.appointmentDate ?? null,
      nextAppointmentDate: future[0]?.appointmentDate ?? null,
    };
  });
}

export async function getDoctorHospitals(doctorId: string) {
  return db
    .select({ id: hospitals.id, name: hospitals.name })
    .from(hospitalDoctors)
    .innerJoin(hospitals, eq(hospitals.id, hospitalDoctors.hospitalId))
    .where(eq(hospitalDoctors.doctorId, doctorId));
}

export interface DoctorPatientDetail {
  patientId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  bloodGroup: string | null;
  appointments: DoctorAppointmentRow[];
}

/**
 * A specific patient's summary — but ONLY if this doctor has at least one
 * appointment with them. Returns `null` otherwise, identical to "patient
 * doesn't exist" from the caller's point of view (no relationship, no
 * information disclosed).
 */
export async function getDoctorPatientDetail(
  doctorId: string,
  patientId: string,
): Promise<DoctorPatientDetail | null> {
  const patientAppointments = (
    await selectDoctorAppointments(doctorId, eq(appointments.patientId, patientId))
  ).map(mapDoctorAppointmentRow);
  if (patientAppointments.length === 0) return null;

  const [profile] = await db
    .select()
    .from(patientProfiles)
    .where(eq(patientProfiles.userId, patientId))
    .limit(1);

  return {
    patientId,
    firstName: profile?.firstName ?? patientAppointments[0]!.patientFirstName,
    lastName: profile?.lastName ?? patientAppointments[0]!.patientLastName,
    phone: profile?.phone ?? null,
    dateOfBirth: profile?.dateOfBirth ?? null,
    gender: profile?.gender ?? null,
    bloodGroup: profile?.bloodGroup ?? null,
    appointments: patientAppointments,
  };
}
