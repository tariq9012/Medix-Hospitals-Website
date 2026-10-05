import "@tanstack/react-start/server-only";

import { and, count, desc, eq, gte, ilike, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  appointments,
  doctors,
  hospitalDepartments,
  hospitalDoctors,
  hospitalServices,
  hospitals,
  patientProfiles,
  specialties,
  hospitalSpecialties,
  users,
  doctorAvailability,
  type Hospital,
} from "@/db/schema";
import { requireHospitalAdmin } from "@/lib/auth/authorization.server";
import type { AuthUser } from "@/lib/auth/authorization.server";
import type {
  HospitalAppointmentFilters,
  HospitalDoctorFilters,
  HospitalPatientFilters,
} from "@/lib/validation/hospital";

export class HospitalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HospitalError";
  }
}

export interface HospitalContext {
  user: AuthUser;
  hospital: Hospital;
  /** Every hospital this admin is authorized for — supports multi-hospital admins. */
  authorizedHospitalIds: string[];
}

/**
 * The single entry point for every hospital-scoped operation. Resolves the
 * session to the admin's authorized hospital(s) via `hospital_admins` and
 * loads the active one. Nothing in this module ever accepts a hospitalId
 * from the client for ownership purposes.
 *
 * When an admin manages several hospitals, `preferredHospitalId` selects
 * between them — but it is still checked against the authorized list, so a
 * forged value resolves to "not authorized" rather than granting access.
 */
export async function resolveHospitalContext(
  preferredHospitalId?: string,
): Promise<HospitalContext> {
  const { user, hospitalIds } = await requireHospitalAdmin();

  const activeId =
    preferredHospitalId && hospitalIds.includes(preferredHospitalId)
      ? preferredHospitalId
      : hospitalIds[0]!;

  const [hospital] = await db.select().from(hospitals).where(eq(hospitals.id, activeId)).limit(1);
  if (!hospital) throw new HospitalError("Hospital not found.");

  return { user, hospital, authorizedHospitalIds: hospitalIds };
}

/**
 * Operational management additionally requires the hospital itself to be
 * APPROVED. A pending/rejected/suspended hospital resolves fine (so the UI
 * can show a useful blocked state) but cannot mutate anything.
 */
export async function requireOperationalHospital(
  preferredHospitalId?: string,
): Promise<HospitalContext> {
  const ctx = await resolveHospitalContext(preferredHospitalId);
  if (ctx.hospital.verificationStatus !== "APPROVED") {
    throw new HospitalError(
      `This hospital's verification is ${ctx.hospital.verificationStatus.toLowerCase()} — management actions are unavailable until it's approved.`,
    );
  }
  return ctx;
}

function paginate<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

function todayLocalDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// --- Dashboard ---------------------------------------------------------------------

export interface HospitalDashboardStats {
  affiliatedDoctors: number;
  verifiedDoctors: number;
  appointmentsToday: number;
  upcomingAppointments: number;
  pendingAppointments: number;
  completedAppointments: number;
  uniquePatients: number;
  departments: number;
  services: number;
}

export async function getHospitalDashboardStats(
  hospitalId: string,
): Promise<HospitalDashboardStats> {
  const today = todayLocalDateString();

  const [
    [affiliated],
    [verified],
    [todayCount],
    [upcoming],
    [pending],
    [completed],
    [patients],
    [departmentCount],
    [serviceCount],
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(hospitalDoctors)
      .where(eq(hospitalDoctors.hospitalId, hospitalId)),
    db
      .select({ value: count() })
      .from(hospitalDoctors)
      .innerJoin(doctors, eq(doctors.id, hospitalDoctors.doctorId))
      .where(
        and(eq(hospitalDoctors.hospitalId, hospitalId), eq(doctors.verificationStatus, "APPROVED")),
      ),
    db
      .select({ value: count() })
      .from(appointments)
      .where(and(eq(appointments.hospitalId, hospitalId), eq(appointments.appointmentDate, today))),
    db
      .select({ value: count() })
      .from(appointments)
      .where(
        and(
          eq(appointments.hospitalId, hospitalId),
          gte(appointments.appointmentDate, today),
          or(eq(appointments.status, "PENDING"), eq(appointments.status, "CONFIRMED"))!,
        ),
      ),
    db
      .select({ value: count() })
      .from(appointments)
      .where(and(eq(appointments.hospitalId, hospitalId), eq(appointments.status, "PENDING"))),
    db
      .select({ value: count() })
      .from(appointments)
      .where(and(eq(appointments.hospitalId, hospitalId), eq(appointments.status, "COMPLETED"))),
    db
      .select({ value: count(sql`distinct ${appointments.patientId}`) })
      .from(appointments)
      .where(eq(appointments.hospitalId, hospitalId)),
    db
      .select({ value: count() })
      .from(hospitalDepartments)
      .where(
        and(eq(hospitalDepartments.hospitalId, hospitalId), eq(hospitalDepartments.isActive, true)),
      ),
    db
      .select({ value: count() })
      .from(hospitalServices)
      .where(and(eq(hospitalServices.hospitalId, hospitalId), eq(hospitalServices.isActive, true))),
  ]);

  return {
    affiliatedDoctors: affiliated?.value ?? 0,
    verifiedDoctors: verified?.value ?? 0,
    appointmentsToday: todayCount?.value ?? 0,
    upcomingAppointments: upcoming?.value ?? 0,
    pendingAppointments: pending?.value ?? 0,
    completedAppointments: completed?.value ?? 0,
    uniquePatients: patients?.value ?? 0,
    departments: departmentCount?.value ?? 0,
    services: serviceCount?.value ?? 0,
  };
}

// --- Doctors -----------------------------------------------------------------------

export async function listHospitalDoctors(hospitalId: string, filters: HospitalDoctorFilters) {
  const conditions: SQL[] = [eq(hospitalDoctors.hospitalId, hospitalId)];
  if (filters.search) {
    const term = `%${filters.search}%`;
    const searchCondition = or(ilike(doctors.firstName, term), ilike(doctors.lastName, term));
    if (searchCondition) conditions.push(searchCondition);
  }
  const where = and(...conditions);

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        affiliationId: hospitalDoctors.id,
        doctorId: doctors.id,
        firstName: doctors.firstName,
        lastName: doctors.lastName,
        slug: doctors.slug,
        verificationStatus: doctors.verificationStatus,
        isAvailable: doctors.isAvailable,
        consultationFee: doctors.consultationFee,
        department: hospitalDoctors.department,
        isPrimary: hospitalDoctors.isPrimary,
        specialty: specialties.name,
        affiliatedAt: hospitalDoctors.createdAt,
      })
      .from(hospitalDoctors)
      .innerJoin(doctors, eq(doctors.id, hospitalDoctors.doctorId))
      .leftJoin(hospitalSpecialties, eq(hospitalSpecialties.hospitalId, hospitalDoctors.hospitalId))
      .leftJoin(specialties, eq(specialties.id, hospitalSpecialties.specialtyId))
      .where(where)
      .orderBy(doctors.lastName)
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    db
      .select({ value: count() })
      .from(hospitalDoctors)
      .innerJoin(doctors, eq(doctors.id, hospitalDoctors.doctorId))
      .where(where),
  ]);

  return paginate(rows, totalRow?.value ?? 0, filters.page, filters.pageSize);
}

// --- Appointments -------------------------------------------------------------------

export async function listHospitalAppointments(
  hospitalId: string,
  filters: HospitalAppointmentFilters,
) {
  const today = todayLocalDateString();
  const conditions: SQL[] = [eq(appointments.hospitalId, hospitalId)];

  if (filters.status) conditions.push(eq(appointments.status, filters.status));
  if (filters.scope === "TODAY") conditions.push(eq(appointments.appointmentDate, today));
  if (filters.scope === "UPCOMING") conditions.push(gte(appointments.appointmentDate, today));
  if (filters.search) {
    const term = `%${filters.search}%`;
    const searchCondition = or(
      ilike(doctors.firstName, term),
      ilike(doctors.lastName, term),
      ilike(patientProfiles.firstName, term),
      ilike(patientProfiles.lastName, term),
    );
    if (searchCondition) conditions.push(searchCondition);
  }
  const where = and(...conditions);

  const base = db
    .select({
      id: appointments.id,
      appointmentDate: appointments.appointmentDate,
      startTime: appointments.startTime,
      status: appointments.status,
      paymentStatus: appointments.paymentStatus,
      consultationType: appointments.consultationType,
      fee: appointments.fee,
      patientFirstName: patientProfiles.firstName,
      patientLastName: patientProfiles.lastName,
      doctorFirstName: doctors.firstName,
      doctorLastName: doctors.lastName,
    })
    .from(appointments)
    .innerJoin(doctors, eq(doctors.id, appointments.doctorId))
    .leftJoin(patientProfiles, eq(patientProfiles.userId, appointments.patientId));

  const [rows, [totalRow]] = await Promise.all([
    base
      .where(where)
      .orderBy(desc(appointments.appointmentDate), desc(appointments.startTime))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    db
      .select({ value: count() })
      .from(appointments)
      .innerJoin(doctors, eq(doctors.id, appointments.doctorId))
      .leftJoin(patientProfiles, eq(patientProfiles.userId, appointments.patientId))
      .where(where),
  ]);

  return paginate(rows, totalRow?.value ?? 0, filters.page, filters.pageSize);
}

/**
 * A single appointment, but only if it belongs to this hospital — the
 * ownership check is part of the query, so another hospital's appointment
 * is indistinguishable from one that doesn't exist.
 */
export async function getHospitalAppointment(hospitalId: string, appointmentId: string) {
  const [row] = await db
    .select({
      id: appointments.id,
      appointmentDate: appointments.appointmentDate,
      startTime: appointments.startTime,
      endTime: appointments.endTime,
      status: appointments.status,
      paymentStatus: appointments.paymentStatus,
      consultationType: appointments.consultationType,
      fee: appointments.fee,
      reasonForVisit: appointments.reasonForVisit,
      createdAt: appointments.createdAt,
      cancellationReason: appointments.cancellationReason,
      patientFirstName: patientProfiles.firstName,
      patientLastName: patientProfiles.lastName,
      patientPhone: patientProfiles.phone,
      doctorFirstName: doctors.firstName,
      doctorLastName: doctors.lastName,
      doctorSlug: doctors.slug,
    })
    .from(appointments)
    .innerJoin(doctors, eq(doctors.id, appointments.doctorId))
    .leftJoin(patientProfiles, eq(patientProfiles.userId, appointments.patientId))
    .where(and(eq(appointments.id, appointmentId), eq(appointments.hospitalId, hospitalId)))
    .limit(1);

  return row ?? null;
}

// --- Patients -------------------------------------------------------------------------

/**
 * Patients who have actually been seen at this hospital. Derived entirely
 * from this hospital's own appointments — there is no global patient
 * directory, and a patient treated only elsewhere never appears here.
 */
export async function listHospitalPatients(hospitalId: string, filters: HospitalPatientFilters) {
  const conditions: SQL[] = [eq(appointments.hospitalId, hospitalId)];
  if (filters.search) {
    const term = `%${filters.search}%`;
    const searchCondition = or(
      ilike(patientProfiles.firstName, term),
      ilike(patientProfiles.lastName, term),
    );
    if (searchCondition) conditions.push(searchCondition);
  }
  const where = and(...conditions);

  const rows = await db
    .select({
      patientId: appointments.patientId,
      firstName: patientProfiles.firstName,
      lastName: patientProfiles.lastName,
      gender: patientProfiles.gender,
      dateOfBirth: patientProfiles.dateOfBirth,
      totalAppointments: count(appointments.id),
      lastVisit: sql<string | null>`max(${appointments.appointmentDate})`,
    })
    .from(appointments)
    .leftJoin(patientProfiles, eq(patientProfiles.userId, appointments.patientId))
    .where(where)
    .groupBy(
      appointments.patientId,
      patientProfiles.firstName,
      patientProfiles.lastName,
      patientProfiles.gender,
      patientProfiles.dateOfBirth,
    )
    .orderBy(desc(sql`max(${appointments.appointmentDate})`))
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);

  const [totalRow] = await db
    .select({ value: count(sql`distinct ${appointments.patientId}`) })
    .from(appointments)
    .leftJoin(patientProfiles, eq(patientProfiles.userId, appointments.patientId))
    .where(where);

  return paginate(rows, totalRow?.value ?? 0, filters.page, filters.pageSize);
}

// --- Schedules --------------------------------------------------------------------------

/**
 * Read-only view of doctor availability at this hospital. Reads the same
 * `doctor_availability` rows the patient booking flow and Doctor Portal use
 * — there is no separate hospital scheduling system. Editing stays with the
 * doctor who owns the schedule.
 */
export async function listHospitalSchedules(hospitalId: string) {
  return db
    .select({
      id: doctorAvailability.id,
      doctorFirstName: doctors.firstName,
      doctorLastName: doctors.lastName,
      dayOfWeek: doctorAvailability.dayOfWeek,
      startTime: doctorAvailability.startTime,
      endTime: doctorAvailability.endTime,
      slotDurationMinutes: doctorAvailability.slotDurationMinutes,
      consultationType: doctorAvailability.consultationType,
      isActive: doctorAvailability.isActive,
    })
    .from(doctorAvailability)
    .innerJoin(doctors, eq(doctors.id, doctorAvailability.doctorId))
    .where(eq(doctorAvailability.hospitalId, hospitalId))
    .orderBy(doctors.lastName, doctorAvailability.dayOfWeek, doctorAvailability.startTime);
}

// --- Specialties ---------------------------------------------------------------------------

export async function listHospitalSpecialties(hospitalId: string) {
  return db
    .select({ id: specialties.id, name: specialties.name })
    .from(hospitalSpecialties)
    .innerJoin(specialties, eq(specialties.id, hospitalSpecialties.specialtyId))
    .where(eq(hospitalSpecialties.hospitalId, hospitalId))
    .orderBy(specialties.name);
}

// --- Doctors available to affiliate ----------------------------------------------------------

/**
 * Verified, active doctors not yet affiliated with this hospital. Exposes
 * only what's needed to pick someone to affiliate — a hospital admin has no
 * business browsing full provider records.
 */
export async function listAffiliatableDoctors(hospitalId: string, search?: string) {
  const alreadyAffiliated = db
    .select({ doctorId: hospitalDoctors.doctorId })
    .from(hospitalDoctors)
    .where(eq(hospitalDoctors.hospitalId, hospitalId));

  const conditions: SQL[] = [
    eq(doctors.verificationStatus, "APPROVED"),
    eq(users.status, "ACTIVE"),
    sql`${doctors.id} not in ${alreadyAffiliated}`,
  ];
  if (search) {
    const term = `%${search}%`;
    const searchCondition = or(ilike(doctors.firstName, term), ilike(doctors.lastName, term));
    if (searchCondition) conditions.push(searchCondition);
  }

  return db
    .select({
      id: doctors.id,
      firstName: doctors.firstName,
      lastName: doctors.lastName,
      slug: doctors.slug,
    })
    .from(doctors)
    .innerJoin(users, eq(users.id, doctors.userId))
    .where(and(...conditions))
    .orderBy(doctors.lastName)
    .limit(20);
}
