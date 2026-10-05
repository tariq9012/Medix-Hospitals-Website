import "@tanstack/react-start/server-only";

import { db } from "@/db";
import { medicalDocuments, type MedicalDocument } from "@/db/schema";
import { recordAuthAuditEvent } from "@/lib/auth/audit.server";
import { ClinicalError } from "@/lib/clinical/errors";
import { createNotification } from "@/lib/notifications/service.server";
import { storage } from "@/lib/storage/storage.server";
import type { UploadMedicalDocumentMetadata } from "@/lib/validation/documents";

import { requireCompletedOwnedAppointment } from "./authorization.server";
import { validateUploadedFile } from "./file-validation.server";

/**
 * Uploads a medical document: validates authorization and the file itself,
 * stores the bytes, then writes the metadata row — with cleanup if the DB
 * write fails, so a failed upload never leaves an orphaned file in
 * storage. (The reverse — an orphaned DB row with no file — can't happen
 * here because the DB insert only runs after `storage.put` has already
 * succeeded.)
 *
 * As with medical records and prescriptions, patient/doctor/hospital
 * identity are always derived from the doctor's own completed appointment
 * — never accepted from client input.
 */
export async function uploadMedicalDocument(
  doctorId: string,
  actorUserId: string,
  metadata: UploadMedicalDocumentMetadata,
  file: { buffer: Buffer; originalFilename: string; declaredMimeType: string },
): Promise<MedicalDocument> {
  const appointment = await requireCompletedOwnedAppointment(doctorId, metadata.appointmentId);

  const validated = validateUploadedFile(file.buffer, file.declaredMimeType);

  const originalFilename =
    // Display metadata only — never used to build a filesystem path (see
    // src/lib/storage/local.server.ts, which generates its own random key
    // regardless of what's passed here).
    file.originalFilename.trim().slice(0, 255) || "document";

  const stored = await storage.put(validated.buffer);

  try {
    const [created] = await db
      .insert(medicalDocuments)
      .values({
        patientId: appointment.patientId,
        doctorId,
        appointmentId: appointment.id,
        medicalRecordId: metadata.medicalRecordId,
        hospitalId: appointment.hospitalId,
        documentType: metadata.documentType,
        title: metadata.title,
        description: metadata.description,
        originalFilename,
        storageKey: stored.key,
        mimeType: validated.mimeType,
        fileSize: validated.size,
        checksum: validated.checksum,
        uploadedByUserId: actorUserId,
      })
      .returning();

    if (!created) {
      throw new ClinicalError("Could not save the document. Please try again.");
    }

    await recordAuthAuditEvent({
      actorUserId,
      action: "MEDICAL_DOCUMENT_UPLOADED",
      entityType: "medical_document",
      entityId: created.id,
      metadata: { appointmentId: appointment.id, patientId: appointment.patientId },
    });

    await createNotification({
      userId: appointment.patientId,
      type: "MEDICAL_DOCUMENT_AVAILABLE",
      title: "New document available",
      message: `Your doctor uploaded a new document: "${metadata.title}".`,
      metadata: { documentId: created.id, appointmentId: appointment.id },
    });

    return created;
  } catch (error) {
    // The DB write failed (or returned nothing) after the file was already
    // stored — clean up the orphan rather than leaving it behind. Best
    // effort: if the cleanup itself fails, the original error still wins.
    await storage.delete(stored.key).catch((cleanupError) => {
      console.error("[documents] failed to clean up orphaned file after DB error:", cleanupError);
    });
    throw error;
  }
}
