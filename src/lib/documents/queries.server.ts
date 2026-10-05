import "@tanstack/react-start/server-only";

import { and, desc, eq, or } from "drizzle-orm";

import { db } from "@/db";
import {
  appointments,
  doctors,
  hospitals,
  medicalDocuments,
  patientProfiles,
  type MedicalDocument,
} from "@/db/schema";

/* ------------------------------- Doctor side ------------------------------ */

export interface DoctorDocumentRow extends MedicalDocument {
  patientFirstName: string;
  patientLastName: string;
  hospitalName: string | null;
  appointmentDate: string | null;
}

/**
 * Documents this doctor may access: ones they personally uploaded, OR ones
 * tied to one of their own appointments (matches Phase 8's "own
 * appointments" scoping — never a patient-wide or hospital-wide directory).
 */
async function selectDoctorDocuments(doctorId: string, extra?: ReturnType<typeof eq>) {
  const ownershipClause = or(
    eq(medicalDocuments.doctorId, doctorId),
    eq(appointments.doctorId, doctorId),
  )!;
  const rows = await db
    .select({
      document: medicalDocuments,
      patientFirstName: patientProfiles.firstName,
      patientLastName: patientProfiles.lastName,
      hospitalName: hospitals.name,
      appointmentDate: appointments.appointmentDate,
    })
    .from(medicalDocuments)
    .leftJoin(appointments, eq(appointments.id, medicalDocuments.appointmentId))
    .leftJoin(patientProfiles, eq(patientProfiles.userId, medicalDocuments.patientId))
    .leftJoin(hospitals, eq(hospitals.id, medicalDocuments.hospitalId))
    .where(extra ? and(ownershipClause, extra) : ownershipClause)
    .orderBy(desc(medicalDocuments.createdAt));

  return rows.map((row) => ({
    ...row.document,
    patientFirstName: row.patientFirstName ?? "Unknown",
    patientLastName: row.patientLastName ?? "Patient",
    hospitalName: row.hospitalName,
    appointmentDate: row.appointmentDate,
  }));
}

export async function listDoctorDocuments(doctorId: string): Promise<DoctorDocumentRow[]> {
  return selectDoctorDocuments(doctorId);
}

export async function getOwnedDoctorDocument(
  doctorId: string,
  documentId: string,
): Promise<DoctorDocumentRow | null> {
  const rows = await selectDoctorDocuments(doctorId, eq(medicalDocuments.id, documentId));
  return rows[0] ?? null;
}

/** Documents tied to a specific appointment, for the appointment-detail integration. */
export async function listDocumentsForAppointment(
  doctorId: string,
  appointmentId: string,
): Promise<DoctorDocumentRow[]> {
  return selectDoctorDocuments(doctorId, eq(medicalDocuments.appointmentId, appointmentId));
}

/** Documents tied to a specific medical record, for the record-detail integration. */
export async function listDocumentsForMedicalRecord(
  doctorId: string,
  medicalRecordId: string,
): Promise<DoctorDocumentRow[]> {
  return selectDoctorDocuments(doctorId, eq(medicalDocuments.medicalRecordId, medicalRecordId));
}

/* ------------------------------- Patient side ------------------------------ */

export interface PatientDocumentRow extends MedicalDocument {
  doctorFirstName: string | null;
  doctorLastName: string | null;
  hospitalName: string | null;
  appointmentDate: string | null;
}

async function selectPatientDocuments(patientId: string, extra?: ReturnType<typeof eq>) {
  const rows = await db
    .select({
      document: medicalDocuments,
      doctorFirstName: doctors.firstName,
      doctorLastName: doctors.lastName,
      hospitalName: hospitals.name,
      appointmentDate: appointments.appointmentDate,
    })
    .from(medicalDocuments)
    .leftJoin(doctors, eq(doctors.id, medicalDocuments.doctorId))
    .leftJoin(hospitals, eq(hospitals.id, medicalDocuments.hospitalId))
    .leftJoin(appointments, eq(appointments.id, medicalDocuments.appointmentId))
    .where(
      extra
        ? and(eq(medicalDocuments.patientId, patientId), extra)
        : eq(medicalDocuments.patientId, patientId),
    )
    .orderBy(desc(medicalDocuments.createdAt));

  return rows.map((row) => ({
    ...row.document,
    doctorFirstName: row.doctorFirstName,
    doctorLastName: row.doctorLastName,
    hospitalName: row.hospitalName,
    appointmentDate: row.appointmentDate,
  }));
}

/** Every document belonging to the authenticated patient. Identity always comes from the session. */
export async function listPatientDocuments(patientId: string): Promise<PatientDocumentRow[]> {
  return selectPatientDocuments(patientId);
}

/**
 * A single document, but ONLY if it belongs to the requesting patient.
 * Ownership is enforced inside the query — a mismatched id/patient pair
 * returns `null` exactly like a nonexistent id would.
 */
export async function getOwnedPatientDocument(
  patientId: string,
  documentId: string,
): Promise<PatientDocumentRow | null> {
  const rows = await selectPatientDocuments(patientId, eq(medicalDocuments.id, documentId));
  return rows[0] ?? null;
}

/** This patient's documents tied to a specific medical record — used on the patient medical-record detail page. */
export async function listPatientDocumentsForRecord(
  patientId: string,
  medicalRecordId: string,
): Promise<PatientDocumentRow[]> {
  return selectPatientDocuments(patientId, eq(medicalDocuments.medicalRecordId, medicalRecordId));
}
