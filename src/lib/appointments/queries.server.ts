import "@tanstack/react-start/server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  doctors,
  doctorSpecialties,
  hospitalDoctors,
  hospitals,
  specialties,
  users,
  appointments,
  type Appointment,
} from "@/db/schema";

import {
  PUBLIC_DOCTOR_CONDITION,
  PUBLIC_HOSPITAL_CONDITION,
} from "@/lib/directory/visibility.server";
import { doctorRatingAggregate } from "@/lib/reviews/aggregate.server";

import type { BookableDoctorDetail, BookableDoctorSummary } from "./types";

/**
 * The single definition of "bookable": the doctor's own account must be
 * ACTIVE, their provider verification must be APPROVED, and they must have
 * marked themselves available. Every doctor-facing query in this file
 * applies all three — a doctor failing any one of them should never appear
 * to a patient or be bookable, even if referenced directly by id.
 */
const BOOKABLE_CONDITIONS = PUBLIC_DOCTOR_CONDITION;

function toSummary(row: {
  id: string;
  slug: string;
  firstName: string;
  lastName: string;
  profileImage: string | null;
  consultationFee: string | null;
  rating: string | null;
  totalReviews: number | null;
  yearsOfExperience: number | null;
  specialtyName: string | null;
}): BookableDoctorSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: `Dr. ${row.firstName} ${row.lastName}`,
    profileImage: row.profileImage,
    specialty: row.specialtyName,
    consultationFee: row.consultationFee,
    // Derived from PUBLISHED reviews (Phase 13). "0" / 0 means "no reviews yet".
    rating: row.rating ?? "0",
    totalReviews: row.totalReviews ?? 0,
    yearsOfExperience: row.yearsOfExperience,
  };
}

/** Doctors a patient may book — safe fields only (no license number, no user id, etc). */
export async function listBookableDoctors(): Promise<BookableDoctorSummary[]> {
  const ratingAgg = doctorRatingAggregate();
  const rows = await db
    .select({
      id: doctors.id,
      slug: doctors.slug,
      firstName: doctors.firstName,
      lastName: doctors.lastName,
      profileImage: doctors.profileImage,
      consultationFee: doctors.consultationFee,
      rating: ratingAgg.avgRating,
      totalReviews: ratingAgg.reviewCount,
      yearsOfExperience: doctors.yearsOfExperience,
      specialtyName: specialties.name,
    })
    .from(doctors)
    .innerJoin(users, eq(doctors.userId, users.id))
    .leftJoin(ratingAgg, eq(ratingAgg.doctorId, doctors.id))
    .leftJoin(
      doctorSpecialties,
      and(eq(doctorSpecialties.doctorId, doctors.id), eq(doctorSpecialties.isPrimary, true)),
    )
    .leftJoin(specialties, eq(specialties.id, doctorSpecialties.specialtyId))
    .where(BOOKABLE_CONDITIONS)
    .orderBy(
      desc(sql`coalesce(${ratingAgg.avgRating}, 0)`),
      asc(doctors.lastName),
      asc(doctors.id),
    );

  return rows.map(toSummary);
}

/**
 * A single bookable doctor plus the hospitals they're genuinely affiliated
 * with (via `hospital_doctors`) — a hospital id supplied elsewhere in the
 * flow is only ever trusted after being cross-checked against this list.
 * Returns `null` if the doctor doesn't exist or isn't currently bookable.
 */
export async function getBookableDoctorById(
  doctorId: string,
): Promise<BookableDoctorDetail | null> {
  const ratingAgg = doctorRatingAggregate();
  const [row] = await db
    .select({
      id: doctors.id,
      slug: doctors.slug,
      firstName: doctors.firstName,
      lastName: doctors.lastName,
      profileImage: doctors.profileImage,
      consultationFee: doctors.consultationFee,
      rating: ratingAgg.avgRating,
      totalReviews: ratingAgg.reviewCount,
      yearsOfExperience: doctors.yearsOfExperience,
      biography: doctors.biography,
    })
    .from(doctors)
    .innerJoin(users, eq(doctors.userId, users.id))
    .leftJoin(ratingAgg, eq(ratingAgg.doctorId, doctors.id))
    .where(and(eq(doctors.id, doctorId), BOOKABLE_CONDITIONS))
    .limit(1);

  if (!row) return null;

  const [primarySpecialty] = await db
    .select({ name: specialties.name })
    .from(doctorSpecialties)
    .innerJoin(specialties, eq(specialties.id, doctorSpecialties.specialtyId))
    .where(and(eq(doctorSpecialties.doctorId, doctorId), eq(doctorSpecialties.isPrimary, true)))
    .limit(1);

  const affiliatedHospitals = await db
    .select({ id: hospitals.id, name: hospitals.name, slug: hospitals.slug, city: hospitals.city })
    .from(hospitalDoctors)
    .innerJoin(hospitals, eq(hospitals.id, hospitalDoctors.hospitalId))
    .where(and(eq(hospitalDoctors.doctorId, doctorId), PUBLIC_HOSPITAL_CONDITION));

  return {
    ...toSummary({ ...row, specialtyName: primarySpecialty?.name ?? null }),
    biography: row.biography,
    hospitals: affiliatedHospitals,
  };
}

/**
 * Verifies a hospital is genuinely affiliated with a doctor before it's
 * trusted anywhere in the booking flow — never trust a hospital id supplied
 * by the client on its own.
 */
export async function isHospitalValidForDoctor(
  doctorId: string,
  hospitalId: string,
): Promise<boolean> {
  // A hospital that is no longer APPROVED (e.g. suspended) can't take NEW bookings;
  // existing appointments there are untouched.
  const [row] = await db
    .select({ id: hospitalDoctors.id })
    .from(hospitalDoctors)
    .innerJoin(hospitals, eq(hospitals.id, hospitalDoctors.hospitalId))
    .where(
      and(
        eq(hospitalDoctors.doctorId, doctorId),
        eq(hospitalDoctors.hospitalId, hospitalId),
        PUBLIC_HOSPITAL_CONDITION,
      ),
    )
    .limit(1);
  return Boolean(row);
}

export interface PatientAppointmentRow extends Appointment {
  doctorName: string;
  doctorSlug: string;
  doctorProfileImage: string | null;
  hospitalName: string | null;
}

async function selectPatientAppointments(patientId: string, extra?: ReturnType<typeof eq>) {
  return db
    .select({
      appointment: appointments,
      doctorFirstName: doctors.firstName,
      doctorLastName: doctors.lastName,
      doctorSlug: doctors.slug,
      doctorProfileImage: doctors.profileImage,
      hospitalName: hospitals.name,
    })
    .from(appointments)
    .innerJoin(doctors, eq(doctors.id, appointments.doctorId))
    .leftJoin(hospitals, eq(hospitals.id, appointments.hospitalId))
    .where(
      extra
        ? and(eq(appointments.patientId, patientId), extra)
        : eq(appointments.patientId, patientId),
    )
    .orderBy(desc(appointments.appointmentDate), desc(appointments.startTime));
}

function mapAppointmentRow(
  row: Awaited<ReturnType<typeof selectPatientAppointments>>[number],
): PatientAppointmentRow {
  return {
    ...row.appointment,
    doctorName: `Dr. ${row.doctorFirstName} ${row.doctorLastName}`,
    doctorSlug: row.doctorSlug,
    doctorProfileImage: row.doctorProfileImage,
    hospitalName: row.hospitalName,
  };
}

/** Every appointment belonging to the authenticated patient — identity always comes from the session, never the client. */
export async function listPatientAppointments(patientId: string): Promise<PatientAppointmentRow[]> {
  const rows = await selectPatientAppointments(patientId);
  return rows.map(mapAppointmentRow);
}

/**
 * A single appointment, but ONLY if it belongs to the requesting patient —
 * the ownership check is baked into the query itself (not applied after the
 * fact), so a mismatched id/patient combination simply returns `null`
 * exactly like a nonexistent appointment would.
 */
export async function getOwnedPatientAppointment(
  patientId: string,
  appointmentId: string,
): Promise<PatientAppointmentRow | null> {
  const rows = await selectPatientAppointments(patientId, eq(appointments.id, appointmentId));
  const row = rows[0];
  return row ? mapAppointmentRow(row) : null;
}

export interface DashboardAppointmentSummary {
  upcomingCount: number;
  nextAppointment: PatientAppointmentRow | null;
}

/** Lightweight summary for the patient dashboard — not the full list. */
export async function getDashboardAppointmentSummary(
  patientId: string,
): Promise<DashboardAppointmentSummary> {
  const rows = await listPatientAppointments(patientId);
  const today = new Date().toISOString().slice(0, 10);

  const upcoming = rows
    .filter(
      (a) => (a.status === "PENDING" || a.status === "CONFIRMED") && a.appointmentDate >= today,
    )
    .sort((a, b) =>
      (a.appointmentDate + a.startTime).localeCompare(b.appointmentDate + b.startTime),
    );

  return { upcomingCount: upcoming.length, nextAppointment: upcoming[0] ?? null };
}
