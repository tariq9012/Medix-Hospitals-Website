import "@tanstack/react-start/server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  appointments,
  doctors,
  doctorSpecialties,
  hospitals,
  medicalRecords,
  patientProfiles,
  prescriptionItems,
  prescriptions,
  specialties,
  users,
  type MedicalRecord,
  type Prescription,
  type PrescriptionItem,
} from "@/db/schema";

/* ------------------------------- Doctor side ------------------------------ */

export interface DoctorMedicalRecordRow extends MedicalRecord {
  patientFirstName: string;
  patientLastName: string;
  hospitalName: string | null;
  appointmentDate: string | null;
}

async function selectDoctorMedicalRecords(doctorId: string, extra?: ReturnType<typeof eq>) {
  return db
    .select({
      record: medicalRecords,
      patientFirstName: patientProfiles.firstName,
      patientLastName: patientProfiles.lastName,
      hospitalName: hospitals.name,
      appointmentDate: appointments.appointmentDate,
    })
    .from(medicalRecords)
    .leftJoin(patientProfiles, eq(patientProfiles.userId, medicalRecords.patientId))
    .leftJoin(hospitals, eq(hospitals.id, medicalRecords.hospitalId))
    .leftJoin(appointments, eq(appointments.id, medicalRecords.appointmentId))
    .where(
      extra
        ? and(eq(medicalRecords.doctorId, doctorId), extra)
        : eq(medicalRecords.doctorId, doctorId),
    )
    .orderBy(desc(medicalRecords.createdAt));
}

function mapDoctorMedicalRecordRow(
  row: Awaited<ReturnType<typeof selectDoctorMedicalRecords>>[number],
): DoctorMedicalRecordRow {
  return {
    ...row.record,
    patientFirstName: row.patientFirstName ?? "Unknown",
    patientLastName: row.patientLastName ?? "Patient",
    hospitalName: row.hospitalName,
    appointmentDate: row.appointmentDate,
  };
}

/**
 * Every medical record this doctor personally authored — never a global
 * directory, and never another doctor's records (see Phase 8 rule #20:
 * doctors see records they personally created / tied to their own
 * appointments, not a broader care-team view).
 */
export async function listDoctorMedicalRecords(
  doctorId: string,
): Promise<DoctorMedicalRecordRow[]> {
  const rows = await selectDoctorMedicalRecords(doctorId);
  return rows.map(mapDoctorMedicalRecordRow);
}

/** A single medical record, but ONLY if this doctor authored it. */
export async function getOwnedDoctorMedicalRecord(
  doctorId: string,
  recordId: string,
): Promise<DoctorMedicalRecordRow | null> {
  const rows = await selectDoctorMedicalRecords(doctorId, eq(medicalRecords.id, recordId));
  const row = rows[0];
  return row ? mapDoctorMedicalRecordRow(row) : null;
}

/**
 * Medical records this doctor personally created for a specific patient —
 * used on the doctor's patient-detail page. Deliberately scoped to records
 * this doctor authored (rule #20: no broader care-team access in Phase 8).
 */
export async function listDoctorMedicalRecordsForPatient(
  doctorId: string,
  patientId: string,
): Promise<DoctorMedicalRecordRow[]> {
  const rows = await selectDoctorMedicalRecords(doctorId, eq(medicalRecords.patientId, patientId));
  return rows.map(mapDoctorMedicalRecordRow);
}

/** The primary medical record for a given appointment, if one exists — used to decide "Create" vs "View" in the UI, and to block a second record from being attempted before hitting the DB constraint. */
export async function getMedicalRecordForAppointment(
  doctorId: string,
  appointmentId: string,
): Promise<MedicalRecord | null> {
  const [row] = await db
    .select()
    .from(medicalRecords)
    .where(
      and(eq(medicalRecords.appointmentId, appointmentId), eq(medicalRecords.doctorId, doctorId)),
    )
    .limit(1);
  return row ?? null;
}

/** The prescription already issued for this appointment by this doctor, if any — used to decide "Create" vs "View" in the appointment detail UI. */
export async function getPrescriptionForAppointment(
  doctorId: string,
  appointmentId: string,
): Promise<Prescription | null> {
  const [row] = await db
    .select()
    .from(prescriptions)
    .where(
      and(eq(prescriptions.appointmentId, appointmentId), eq(prescriptions.doctorId, doctorId)),
    )
    .limit(1);
  return row ?? null;
}

export interface DoctorPrescriptionRow extends Prescription {
  patientFirstName: string;
  patientLastName: string;
  hospitalName: string | null;
  appointmentDate: string | null;
  itemCount: number;
}

async function selectDoctorPrescriptions(doctorId: string, extra?: ReturnType<typeof eq>) {
  const rows = await db
    .select({
      prescription: prescriptions,
      patientFirstName: patientProfiles.firstName,
      patientLastName: patientProfiles.lastName,
      hospitalName: hospitals.name,
      appointmentDate: appointments.appointmentDate,
    })
    .from(prescriptions)
    .leftJoin(patientProfiles, eq(patientProfiles.userId, prescriptions.patientId))
    .leftJoin(hospitals, eq(hospitals.id, prescriptions.hospitalId))
    .leftJoin(appointments, eq(appointments.id, prescriptions.appointmentId))
    .where(
      extra
        ? and(eq(prescriptions.doctorId, doctorId), extra)
        : eq(prescriptions.doctorId, doctorId),
    )
    .orderBy(desc(prescriptions.createdAt));

  const itemCounts = await countItemsByPrescription(rows.map((r) => r.prescription.id));

  return rows.map((row) => ({
    ...row,
    itemCount: itemCounts.get(row.prescription.id) ?? 0,
  }));
}

async function countItemsByPrescription(prescriptionIds: string[]): Promise<Map<string, number>> {
  if (prescriptionIds.length === 0) return new Map();
  const rows = await db
    .select({
      prescriptionId: prescriptionItems.prescriptionId,
      value: sql<number>`count(*)`.mapWith(Number),
    })
    .from(prescriptionItems)
    .where(inArray(prescriptionItems.prescriptionId, prescriptionIds))
    .groupBy(prescriptionItems.prescriptionId);
  return new Map(rows.map((r) => [r.prescriptionId, r.value]));
}

function mapDoctorPrescriptionRow(row: {
  prescription: Prescription;
  patientFirstName: string | null;
  patientLastName: string | null;
  hospitalName: string | null;
  appointmentDate: string | null;
  itemCount: number;
}): DoctorPrescriptionRow {
  return {
    ...row.prescription,
    patientFirstName: row.patientFirstName ?? "Unknown",
    patientLastName: row.patientLastName ?? "Patient",
    hospitalName: row.hospitalName,
    appointmentDate: row.appointmentDate,
    itemCount: row.itemCount,
  };
}

/** Every prescription this doctor personally issued — never a global search. */
export async function listDoctorPrescriptions(doctorId: string): Promise<DoctorPrescriptionRow[]> {
  const rows = await selectDoctorPrescriptions(doctorId);
  return rows.map(mapDoctorPrescriptionRow);
}

export interface PrescriptionWithItems extends Prescription {
  items: PrescriptionItem[];
}

export interface DoctorPrescriptionDetail extends PrescriptionWithItems {
  patientFirstName: string;
  patientLastName: string;
  hospitalName: string | null;
}

/** A single prescription plus its items, but ONLY if this doctor issued it. */
export async function getOwnedDoctorPrescription(
  doctorId: string,
  prescriptionId: string,
): Promise<DoctorPrescriptionDetail | null> {
  const [row] = await db
    .select({
      prescription: prescriptions,
      patientFirstName: patientProfiles.firstName,
      patientLastName: patientProfiles.lastName,
      hospitalName: hospitals.name,
    })
    .from(prescriptions)
    .leftJoin(patientProfiles, eq(patientProfiles.userId, prescriptions.patientId))
    .leftJoin(hospitals, eq(hospitals.id, prescriptions.hospitalId))
    .where(and(eq(prescriptions.id, prescriptionId), eq(prescriptions.doctorId, doctorId)))
    .limit(1);
  if (!row) return null;

  const items = await db
    .select()
    .from(prescriptionItems)
    .where(eq(prescriptionItems.prescriptionId, row.prescription.id));

  return {
    ...row.prescription,
    items,
    patientFirstName: row.patientFirstName ?? "Unknown",
    patientLastName: row.patientLastName ?? "Patient",
    hospitalName: row.hospitalName,
  };
}

/* ------------------------------- Patient side ------------------------------ */

export interface PatientMedicalRecordRow extends MedicalRecord {
  doctorFirstName: string;
  doctorLastName: string;
  specialtyName: string | null;
  hospitalName: string | null;
  appointmentDate: string | null;
}

async function selectPatientMedicalRecords(patientId: string, extra?: ReturnType<typeof eq>) {
  const rows = await db
    .select({
      record: medicalRecords,
      doctorFirstName: doctors.firstName,
      doctorLastName: doctors.lastName,
      doctorId: doctors.id,
      hospitalName: hospitals.name,
      appointmentDate: appointments.appointmentDate,
    })
    .from(medicalRecords)
    .leftJoin(doctors, eq(doctors.id, medicalRecords.doctorId))
    .leftJoin(hospitals, eq(hospitals.id, medicalRecords.hospitalId))
    .leftJoin(appointments, eq(appointments.id, medicalRecords.appointmentId))
    .where(
      extra
        ? and(eq(medicalRecords.patientId, patientId), extra)
        : eq(medicalRecords.patientId, patientId),
    )
    .orderBy(desc(medicalRecords.createdAt));

  const doctorIds = rows.map((r) => r.doctorId).filter((id): id is string => Boolean(id));
  const specialtyByDoctor = await getPrimarySpecialtiesByDoctor(doctorIds);

  return rows.map((row) => ({
    ...row.record,
    doctorFirstName: row.doctorFirstName ?? "Unknown",
    doctorLastName: row.doctorLastName ?? "Doctor",
    specialtyName: row.doctorId ? (specialtyByDoctor.get(row.doctorId) ?? null) : null,
    hospitalName: row.hospitalName,
    appointmentDate: row.appointmentDate,
  }));
}

async function getPrimarySpecialtiesByDoctor(doctorIds: string[]): Promise<Map<string, string>> {
  if (doctorIds.length === 0) return new Map();
  const rows = await db
    .select({ doctorId: doctorSpecialties.doctorId, name: specialties.name })
    .from(doctorSpecialties)
    .innerJoin(specialties, eq(specialties.id, doctorSpecialties.specialtyId))
    .where(eq(doctorSpecialties.isPrimary, true));
  const map = new Map<string, string>();
  for (const row of rows) {
    if (doctorIds.includes(row.doctorId)) map.set(row.doctorId, row.name);
  }
  return map;
}

/**
 * Every medical record belonging to the authenticated patient. Identity
 * always comes from the session — never a browser-supplied patientId.
 */
export async function listPatientMedicalRecords(
  patientId: string,
): Promise<PatientMedicalRecordRow[]> {
  return selectPatientMedicalRecords(patientId);
}

/**
 * A single medical record, but ONLY if it belongs to the requesting
 * patient. The ownership check is baked into the query itself (not applied
 * after the fact), so a mismatched id/patient combination returns `null`
 * exactly like a nonexistent record would — Patient A can't tell whether
 * Patient B's record id is real by probing it.
 */
export async function getOwnedPatientMedicalRecord(
  patientId: string,
  recordId: string,
): Promise<PatientMedicalRecordRow | null> {
  const rows = await selectPatientMedicalRecords(patientId, eq(medicalRecords.id, recordId));
  return rows[0] ?? null;
}

export interface PatientPrescriptionRow extends Prescription {
  doctorFirstName: string;
  doctorLastName: string;
  specialtyName: string | null;
  appointmentDate: string | null;
  itemCount: number;
}

async function selectPatientPrescriptions(patientId: string, extra?: ReturnType<typeof eq>) {
  const rows = await db
    .select({
      prescription: prescriptions,
      doctorFirstName: doctors.firstName,
      doctorLastName: doctors.lastName,
      doctorId: doctors.id,
      appointmentDate: appointments.appointmentDate,
    })
    .from(prescriptions)
    .leftJoin(doctors, eq(doctors.id, prescriptions.doctorId))
    .leftJoin(appointments, eq(appointments.id, prescriptions.appointmentId))
    .where(
      extra
        ? and(eq(prescriptions.patientId, patientId), extra)
        : eq(prescriptions.patientId, patientId),
    )
    .orderBy(desc(prescriptions.createdAt));

  const doctorIds = rows.map((r) => r.doctorId).filter((id): id is string => Boolean(id));
  const specialtyByDoctor = await getPrimarySpecialtiesByDoctor(doctorIds);
  const itemCounts = await countItemsByPrescription(rows.map((r) => r.prescription.id));

  return rows.map((row) => ({
    ...row.prescription,
    doctorFirstName: row.doctorFirstName ?? "Unknown",
    doctorLastName: row.doctorLastName ?? "Doctor",
    specialtyName: row.doctorId ? (specialtyByDoctor.get(row.doctorId) ?? null) : null,
    appointmentDate: row.appointmentDate,
    itemCount: itemCounts.get(row.prescription.id) ?? 0,
  }));
}

/** Every prescription belonging to the authenticated patient. */
export async function listPatientPrescriptions(
  patientId: string,
): Promise<PatientPrescriptionRow[]> {
  return selectPatientPrescriptions(patientId);
}

export interface PatientPrescriptionDetail extends PatientPrescriptionRow {
  items: PrescriptionItem[];
}

/**
 * A single prescription plus items, but ONLY if it belongs to the
 * requesting patient — ownership enforced inside the query, never fetched
 * globally and filtered in React.
 */
export async function getOwnedPatientPrescription(
  patientId: string,
  prescriptionId: string,
): Promise<PatientPrescriptionDetail | null> {
  const rows = await selectPatientPrescriptions(patientId, eq(prescriptions.id, prescriptionId));
  const row = rows[0];
  if (!row) return null;

  const items = await db
    .select()
    .from(prescriptionItems)
    .where(eq(prescriptionItems.prescriptionId, row.id));

  return { ...row, items };
}
