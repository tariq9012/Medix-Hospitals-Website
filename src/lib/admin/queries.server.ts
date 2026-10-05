import "@tanstack/react-start/server-only";

import { and, count, desc, eq, gte, ilike, lte, or, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  appointments,
  auditLogs,
  doctors,
  hospitals,
  patientProfiles,
  providerVerificationEvents,
  users,
} from "@/db/schema";
import type {
  AdminAppointmentFilters,
  AdminAuditFilters,
  AdminDoctorFilters,
  AdminHospitalFilters,
  AdminUserFilters,
} from "@/lib/validation/admin";

/**
 * Every list query here is paginated server-side — admin datasets grow
 * without bound, so no endpoint in this module can return an unbounded
 * result set. `page`/`pageSize` are validated (and `pageSize` capped) by the
 * Zod schemas in `src/lib/validation/admin.ts` before reaching these.
 *
 * Nothing here ever selects `passwordHash`, session/reset/verification
 * token hashes, or clinical records — admin access still follows
 * least-privilege.
 */

function paginate<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

function todayLocalDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export interface AdminDashboardStats {
  totalUsers: number;
  totalPatients: number;
  totalDoctors: number;
  verifiedDoctors: number;
  pendingDoctors: number;
  totalHospitals: number;
  verifiedHospitals: number;
  pendingHospitals: number;
  totalAppointments: number;
  appointmentsToday: number;
  completedAppointments: number;
  cancelledAppointments: number;
}

export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  const today = todayLocalDateString();

  // Each count is written against its own table rather than through a
  // generic helper — Drizzle's types can't express "any of these tables"
  // without an unsafe cast, and the explicit version stays type-checked.
  const [
    [totalUsersRow],
    [totalPatientsRow],
    [totalDoctorsRow],
    [verifiedDoctorsRow],
    [pendingDoctorsRow],
    [totalHospitalsRow],
    [verifiedHospitalsRow],
    [pendingHospitalsRow],
    [totalAppointmentsRow],
    [appointmentsTodayRow],
    [completedAppointmentsRow],
    [cancelledAppointmentsRow],
  ] = await Promise.all([
    db.select({ value: count() }).from(users),
    db.select({ value: count() }).from(users).where(eq(users.role, "PATIENT")),
    db.select({ value: count() }).from(doctors),
    db.select({ value: count() }).from(doctors).where(eq(doctors.verificationStatus, "APPROVED")),
    db.select({ value: count() }).from(doctors).where(eq(doctors.verificationStatus, "PENDING")),
    db.select({ value: count() }).from(hospitals),
    db
      .select({ value: count() })
      .from(hospitals)
      .where(eq(hospitals.verificationStatus, "APPROVED")),
    db
      .select({ value: count() })
      .from(hospitals)
      .where(eq(hospitals.verificationStatus, "PENDING")),
    db.select({ value: count() }).from(appointments),
    db.select({ value: count() }).from(appointments).where(eq(appointments.appointmentDate, today)),
    db.select({ value: count() }).from(appointments).where(eq(appointments.status, "COMPLETED")),
    db.select({ value: count() }).from(appointments).where(eq(appointments.status, "CANCELLED")),
  ]);

  return {
    totalUsers: totalUsersRow?.value ?? 0,
    totalPatients: totalPatientsRow?.value ?? 0,
    totalDoctors: totalDoctorsRow?.value ?? 0,
    verifiedDoctors: verifiedDoctorsRow?.value ?? 0,
    pendingDoctors: pendingDoctorsRow?.value ?? 0,
    totalHospitals: totalHospitalsRow?.value ?? 0,
    verifiedHospitals: verifiedHospitalsRow?.value ?? 0,
    pendingHospitals: pendingHospitalsRow?.value ?? 0,
    totalAppointments: totalAppointmentsRow?.value ?? 0,
    appointmentsToday: appointmentsTodayRow?.value ?? 0,
    completedAppointments: completedAppointmentsRow?.value ?? 0,
    cancelledAppointments: cancelledAppointmentsRow?.value ?? 0,
  };
}

/** Most recent sign-ups across all roles — safe fields only. */
export async function listRecentRegistrations(limit = 5) {
  return db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(limit);
}

export async function listRecentVerificationEvents(limit = 5) {
  return db
    .select()
    .from(providerVerificationEvents)
    .orderBy(desc(providerVerificationEvents.createdAt))
    .limit(limit);
}

// --- Users --------------------------------------------------------------------

export async function listAdminUsers(filters: AdminUserFilters) {
  const conditions: SQL[] = [];
  if (filters.role) conditions.push(eq(users.role, filters.role));
  if (filters.status) conditions.push(eq(users.status, filters.status));
  if (filters.search) conditions.push(ilike(users.email, `%${filters.search}%`));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        status: users.status,
        emailVerified: users.emailVerified,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    db.select({ value: count() }).from(users).where(where),
  ]);

  return paginate(rows, totalRow?.value ?? 0, filters.page, filters.pageSize);
}

/** Admin-safe single user view — deliberately excludes any clinical data. */
export async function getAdminUserDetail(userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      status: users.status,
      emailVerified: users.emailVerified,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return null;

  const [profile] = await db
    .select({ firstName: patientProfiles.firstName, lastName: patientProfiles.lastName })
    .from(patientProfiles)
    .where(eq(patientProfiles.userId, userId))
    .limit(1);

  const [doctor] = await db
    .select({
      id: doctors.id,
      firstName: doctors.firstName,
      lastName: doctors.lastName,
      verificationStatus: doctors.verificationStatus,
    })
    .from(doctors)
    .where(eq(doctors.userId, userId))
    .limit(1);

  return { ...user, patientProfile: profile ?? null, doctor: doctor ?? null };
}

// --- Doctors ------------------------------------------------------------------

export async function listAdminDoctors(filters: AdminDoctorFilters) {
  const conditions: SQL[] = [];
  if (filters.verificationStatus) {
    conditions.push(eq(doctors.verificationStatus, filters.verificationStatus));
  }
  if (filters.status) conditions.push(eq(users.status, filters.status));
  if (filters.search) {
    const term = `%${filters.search}%`;
    const searchCondition = or(
      ilike(doctors.firstName, term),
      ilike(doctors.lastName, term),
      ilike(users.email, term),
    );
    if (searchCondition) conditions.push(searchCondition);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: doctors.id,
        firstName: doctors.firstName,
        lastName: doctors.lastName,
        slug: doctors.slug,
        email: users.email,
        verificationStatus: doctors.verificationStatus,
        verificationReason: doctors.verificationReason,
        isAvailable: doctors.isAvailable,
        yearsOfExperience: doctors.yearsOfExperience,
        medicalLicenseNumber: doctors.medicalLicenseNumber,
        accountStatus: users.status,
        createdAt: doctors.createdAt,
      })
      .from(doctors)
      .innerJoin(users, eq(users.id, doctors.userId))
      .where(where)
      .orderBy(desc(doctors.createdAt))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    db
      .select({ value: count() })
      .from(doctors)
      .innerJoin(users, eq(users.id, doctors.userId))
      .where(where),
  ]);

  return paginate(rows, totalRow?.value ?? 0, filters.page, filters.pageSize);
}

export async function getAdminDoctorDetail(doctorId: string) {
  const [row] = await db
    .select({
      id: doctors.id,
      userId: doctors.userId,
      firstName: doctors.firstName,
      lastName: doctors.lastName,
      slug: doctors.slug,
      email: users.email,
      biography: doctors.biography,
      qualifications: doctors.qualifications,
      yearsOfExperience: doctors.yearsOfExperience,
      medicalLicenseNumber: doctors.medicalLicenseNumber,
      consultationFee: doctors.consultationFee,
      verificationStatus: doctors.verificationStatus,
      verificationReason: doctors.verificationReason,
      verificationReviewedAt: doctors.verificationReviewedAt,
      isAvailable: doctors.isAvailable,
      accountStatus: users.status,
      createdAt: doctors.createdAt,
    })
    .from(doctors)
    .innerJoin(users, eq(users.id, doctors.userId))
    .where(eq(doctors.id, doctorId))
    .limit(1);

  if (!row) return null;

  const history = await db
    .select()
    .from(providerVerificationEvents)
    .where(eq(providerVerificationEvents.providerId, doctorId))
    .orderBy(desc(providerVerificationEvents.createdAt));

  return { ...row, history };
}

// --- Hospitals ----------------------------------------------------------------

export async function listAdminHospitals(filters: AdminHospitalFilters) {
  const conditions: SQL[] = [];
  if (filters.verificationStatus) {
    conditions.push(eq(hospitals.verificationStatus, filters.verificationStatus));
  }
  if (filters.city) conditions.push(ilike(hospitals.city, `%${filters.city}%`));
  if (filters.search) conditions.push(ilike(hospitals.name, `%${filters.search}%`));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: hospitals.id,
        name: hospitals.name,
        slug: hospitals.slug,
        email: hospitals.email,
        phone: hospitals.phone,
        city: hospitals.city,
        verificationStatus: hospitals.verificationStatus,
        verificationReason: hospitals.verificationReason,
        createdAt: hospitals.createdAt,
      })
      .from(hospitals)
      .where(where)
      .orderBy(desc(hospitals.createdAt))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    db.select({ value: count() }).from(hospitals).where(where),
  ]);

  return paginate(rows, totalRow?.value ?? 0, filters.page, filters.pageSize);
}

export async function getAdminHospitalDetail(hospitalId: string) {
  const [row] = await db.select().from(hospitals).where(eq(hospitals.id, hospitalId)).limit(1);
  if (!row) return null;

  const history = await db
    .select()
    .from(providerVerificationEvents)
    .where(eq(providerVerificationEvents.providerId, hospitalId))
    .orderBy(desc(providerVerificationEvents.createdAt));

  return { ...row, history };
}

// --- Appointment oversight -------------------------------------------------------

/**
 * Read-only platform appointment oversight. Deliberately omits
 * `patientNotes` and `reasonForVisit` — an admin overseeing scheduling
 * doesn't need the patient's free-text clinical context.
 */
export async function listAdminAppointments(filters: AdminAppointmentFilters) {
  const conditions: SQL[] = [];
  if (filters.status) conditions.push(eq(appointments.status, filters.status));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: appointments.id,
        appointmentDate: appointments.appointmentDate,
        startTime: appointments.startTime,
        status: appointments.status,
        paymentStatus: appointments.paymentStatus,
        consultationType: appointments.consultationType,
        fee: appointments.fee,
        patientEmail: users.email,
        doctorFirstName: doctors.firstName,
        doctorLastName: doctors.lastName,
        hospitalName: hospitals.name,
      })
      .from(appointments)
      .innerJoin(users, eq(users.id, appointments.patientId))
      .innerJoin(doctors, eq(doctors.id, appointments.doctorId))
      .leftJoin(hospitals, eq(hospitals.id, appointments.hospitalId))
      .where(where)
      .orderBy(desc(appointments.appointmentDate), desc(appointments.startTime))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    db.select({ value: count() }).from(appointments).where(where),
  ]);

  return paginate(rows, totalRow?.value ?? 0, filters.page, filters.pageSize);
}

// --- Audit logs --------------------------------------------------------------------

export async function listAdminAuditLogs(filters: AdminAuditFilters) {
  const conditions: SQL[] = [];
  if (filters.action) conditions.push(eq(auditLogs.action, filters.action));
  if (filters.actorUserId) conditions.push(eq(auditLogs.actorUserId, filters.actorUserId));
  if (filters.fromDate) {
    conditions.push(gte(auditLogs.createdAt, new Date(`${filters.fromDate}T00:00:00`)));
  }
  if (filters.toDate) {
    conditions.push(lte(auditLogs.createdAt, new Date(`${filters.toDate}T23:59:59`)));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        metadata: auditLogs.metadata,
        ipAddress: auditLogs.ipAddress,
        createdAt: auditLogs.createdAt,
        actorEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    db.select({ value: count() }).from(auditLogs).where(where),
  ]);

  return paginate(rows, totalRow?.value ?? 0, filters.page, filters.pageSize);
}

/** Distinct action names, for populating the activity-log filter dropdown. */
export async function listAuditActionNames() {
  const rows = await db
    .selectDistinct({ action: auditLogs.action })
    .from(auditLogs)
    .orderBy(auditLogs.action);
  return rows.map((r) => r.action);
}
