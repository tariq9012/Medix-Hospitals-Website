import "@tanstack/react-start/server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { medicalRecords, type MedicalRecord } from "@/db/schema";
import { recordAuthAuditEvent } from "@/lib/auth/audit.server";
import { createNotification } from "@/lib/notifications/service.server";
import type { CreateMedicalRecordInput, UpdateMedicalRecordInput } from "@/lib/validation/clinical";

import { requireCompletedOwnedAppointment } from "./authorization.server";
import { ClinicalError } from "./errors";

/** Postgres unique-violation error code. */
const UNIQUE_VIOLATION = "23505";

/**
 * Drizzle wraps driver errors in `DrizzleQueryError`, which puts the real
 * Postgres error (with its `code`) under `.cause` rather than on the error
 * itself — so both shapes need checking here (same pattern as
 * `src/lib/appointments/service.server.ts`).
 */
function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === UNIQUE_VIOLATION) return true;
  if ("cause" in error && error.cause && typeof error.cause === "object" && "code" in error.cause) {
    return error.cause.code === UNIQUE_VIOLATION;
  }
  return false;
}

/**
 * Creates the primary medical record for a completed appointment.
 *
 * Every fact about who this record belongs to — the patient, the doctor,
 * the hospital — is re-derived here from the authenticated doctor's own
 * appointment, never taken from client input at face value.
 *
 * One primary record per appointment is enforced at the database level
 * (`medical_records_appointment_unique`). Two concurrent requests for the
 * same appointment both pass the authorization check above and both
 * attempt the INSERT — Postgres allows exactly one to succeed; the other's
 * unique-violation is caught here and turned into a clear, safe error
 * instead of a 500 or a silent duplicate.
 */
export async function createMedicalRecord(
  doctorId: string,
  actorUserId: string,
  input: CreateMedicalRecordInput,
): Promise<MedicalRecord> {
  const appointment = await requireCompletedOwnedAppointment(doctorId, input.appointmentId);

  try {
    const [created] = await db.transaction(async (tx) => {
      const rows = await tx
        .insert(medicalRecords)
        .values({
          patientId: appointment.patientId,
          doctorId,
          appointmentId: appointment.id,
          hospitalId: appointment.hospitalId,
          chiefComplaint: input.chiefComplaint,
          diagnosis: input.diagnosis,
          symptoms: input.symptoms,
          clinicalNotes: input.clinicalNotes,
          allergies: input.allergies,
          vitals: input.vitals,
          treatmentPlan: input.treatmentPlan,
          treatmentNotes: input.treatmentNotes,
          followUpInstructions: input.followUpInstructions,
          followUpDate: input.followUpDate,
        })
        .returning();
      return rows;
    });

    if (!created) {
      throw new ClinicalError("Could not create the medical record. Please try again.");
    }

    await recordAuthAuditEvent({
      actorUserId,
      action: "MEDICAL_RECORD_CREATED",
      entityType: "medical_record",
      entityId: created.id,
      metadata: { appointmentId: appointment.id, patientId: appointment.patientId },
    });

    await createNotification({
      userId: appointment.patientId,
      type: "MEDICAL_RECORD_AVAILABLE",
      title: "New medical record",
      message: "Your doctor added a new medical record to your history.",
      metadata: { recordId: created.id, appointmentId: appointment.id },
    });

    return created;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ClinicalError("A medical record already exists for this appointment.");
    }
    throw error;
  }
}

/**
 * Updates a medical record. Only the doctor who created it may edit it in
 * this phase — hospital/admin editing is intentionally out of scope (rule
 * #7). Ownership is enforced inside the `UPDATE ... WHERE` clause itself,
 * not checked-then-trusted separately, so a race against a concurrent
 * delete/reassignment can't slip through.
 *
 * This does not keep a revision history — see the README's "Known
 * limitations" section. `updatedAt` moves forward and the edit is audited
 * (without copying clinical text into the audit log), but the prior
 * diagnosis/notes text is overwritten rather than versioned.
 */
export async function updateMedicalRecord(
  doctorId: string,
  actorUserId: string,
  input: UpdateMedicalRecordInput,
): Promise<MedicalRecord> {
  const [existing] = await db
    .select()
    .from(medicalRecords)
    .where(and(eq(medicalRecords.id, input.recordId), eq(medicalRecords.doctorId, doctorId)))
    .limit(1);

  if (!existing) {
    // Same message whether it doesn't exist or belongs to another doctor —
    // never confirm which one to an unauthorized caller.
    throw new ClinicalError("Medical record not found.");
  }

  const { recordId: _recordId, ...fields } = input;
  void _recordId;

  const [updated] = await db
    .update(medicalRecords)
    .set({
      chiefComplaint: fields.chiefComplaint ?? existing.chiefComplaint,
      diagnosis: fields.diagnosis ?? existing.diagnosis,
      symptoms: fields.symptoms ?? existing.symptoms,
      clinicalNotes: fields.clinicalNotes ?? existing.clinicalNotes,
      allergies: fields.allergies ?? existing.allergies,
      vitals: fields.vitals ?? existing.vitals,
      treatmentPlan: fields.treatmentPlan ?? existing.treatmentPlan,
      treatmentNotes: fields.treatmentNotes ?? existing.treatmentNotes,
      followUpInstructions: fields.followUpInstructions ?? existing.followUpInstructions,
      followUpDate: fields.followUpDate ?? existing.followUpDate,
      updatedAt: new Date(),
    })
    .where(and(eq(medicalRecords.id, input.recordId), eq(medicalRecords.doctorId, doctorId)))
    .returning();

  if (!updated) {
    throw new ClinicalError("Medical record not found.");
  }

  await recordAuthAuditEvent({
    actorUserId,
    action: "MEDICAL_RECORD_UPDATED",
    entityType: "medical_record",
    entityId: updated.id,
    metadata: { appointmentId: updated.appointmentId },
  });

  return updated;
}
