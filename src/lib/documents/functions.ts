import { createServerFn } from "@tanstack/react-start";
import { isRedirect } from "@tanstack/react-router";
import { z } from "zod";

import { recordAuthAuditEvent } from "@/lib/auth/audit.server";
import { requireAnyRole, requireRole } from "@/lib/auth/authorization.server";
import { requireVerifiedDoctorRecord } from "@/lib/doctor/queries.server";
import { idSchema } from "@/lib/validation/common";
import { documentIdSchema, uploadMedicalDocumentMetadataSchema } from "@/lib/validation/documents";
import { storage } from "@/lib/storage/storage.server";

import { ClinicalError } from "../clinical/errors";
import {
  getOwnedDoctorDocument,
  getOwnedPatientDocument,
  listDoctorDocuments,
  listDocumentsForAppointment,
  listDocumentsForMedicalRecord,
  listPatientDocuments,
  listPatientDocumentsForRecord,
} from "./queries.server";
import { uploadMedicalDocument } from "./service.server";

/**
 * Same client-safe boundary pattern as `src/lib/clinical/functions.ts`:
 * every handler resolves identity itself (`requireVerifiedDoctorRecord`,
 * `requireRole`, `requireAnyRole`) — no patientId/doctorId/documentId
 * ownership is ever taken on faith from client input.
 */

interface ActionError {
  message: string;
}
type ActionResult<T extends object> = ({ ok: true } & T) | ({ ok: false } & ActionError);

function toActionError(error: unknown): ActionError {
  if (isRedirect(error)) throw error;
  if (error instanceof ClinicalError) return { message: error.message };
  console.error("[documents] unexpected error:", error);
  return { message: "Something went wrong. Please try again." };
}

// --- Doctor: upload & list ---------------------------------------------------

/**
 * Accepts a `FormData` body (method POST bypasses the JSON-serializable
 * constraint for `FormData` specifically — see `createServerFn`'s types).
 * Expected fields: `file` (the Blob/File), `appointmentId`, `documentType`,
 * `title`, `description?`, `medicalRecordId?`.
 */
export const uploadMedicalDocumentFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) {
      throw new Error("Expected multipart form data.");
    }
    return data;
  })
  .handler(async ({ data }): Promise<ActionResult<{ documentId: string }>> => {
    try {
      const doctor = await requireVerifiedDoctorRecord();

      const file = data.get("file");
      if (!(file instanceof File)) {
        return { ok: false, message: "No file was uploaded." };
      }

      const metadata = uploadMedicalDocumentMetadataSchema.parse({
        appointmentId: data.get("appointmentId"),
        medicalRecordId: data.get("medicalRecordId") || undefined,
        documentType: data.get("documentType"),
        title: data.get("title"),
        description: data.get("description") || undefined,
      });

      const buffer = Buffer.from(await file.arrayBuffer());
      const document = await uploadMedicalDocument(doctor.id, doctor.userId, metadata, {
        buffer,
        originalFilename: file.name,
        declaredMimeType: file.type,
      });

      return { ok: true, documentId: document.id };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { ok: false, message: error.issues[0]?.message ?? "Invalid document details." };
      }
      return { ok: false, ...toActionError(error) };
    }
  });

export const listDoctorDocumentsFn = createServerFn({ method: "GET" }).handler(async () => {
  const doctor = await requireVerifiedDoctorRecord();
  try {
    return await listDoctorDocuments(doctor.id);
  } catch (error) {
    console.error("[documents] listDoctorDocumentsFn failed:", error);
    return [];
  }
});

export const getDoctorDocumentFn = createServerFn({ method: "GET" })
  .validator(documentIdSchema)
  .handler(async ({ data }) => {
    const doctor = await requireVerifiedDoctorRecord();
    try {
      const document = await getOwnedDoctorDocument(doctor.id, data.documentId);
      if (document) {
        await recordAuthAuditEvent({
          actorUserId: doctor.userId,
          action: "MEDICAL_DOCUMENT_VIEWED",
          entityType: "medical_document",
          entityId: document.id,
        });
      }
      return document;
    } catch (error) {
      console.error("[documents] getDoctorDocumentFn failed:", error);
      return null;
    }
  });

export const listDocumentsForAppointmentFn = createServerFn({ method: "GET" })
  .validator(z.object({ appointmentId: idSchema }))
  .handler(async ({ data }) => {
    const doctor = await requireVerifiedDoctorRecord();
    try {
      return await listDocumentsForAppointment(doctor.id, data.appointmentId);
    } catch (error) {
      console.error("[documents] listDocumentsForAppointmentFn failed:", error);
      return [];
    }
  });

export const listDocumentsForMedicalRecordFn = createServerFn({ method: "GET" })
  .validator(z.object({ medicalRecordId: idSchema }))
  .handler(async ({ data }) => {
    const doctor = await requireVerifiedDoctorRecord();
    try {
      return await listDocumentsForMedicalRecord(doctor.id, data.medicalRecordId);
    } catch (error) {
      console.error("[documents] listDocumentsForMedicalRecordFn failed:", error);
      return [];
    }
  });

// --- Patient: list ------------------------------------------------------------

export const listMyDocumentsFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireRole("PATIENT");
  try {
    return await listPatientDocuments(user.id);
  } catch (error) {
    console.error("[documents] listMyDocumentsFn failed:", error);
    return [];
  }
});

export const getMyDocumentFn = createServerFn({ method: "GET" })
  .validator(documentIdSchema)
  .handler(async ({ data }) => {
    const user = await requireRole("PATIENT");
    try {
      const document = await getOwnedPatientDocument(user.id, data.documentId);
      if (document) {
        await recordAuthAuditEvent({
          actorUserId: user.id,
          action: "MEDICAL_DOCUMENT_VIEWED",
          entityType: "medical_document",
          entityId: document.id,
        });
      }
      return document;
    } catch (error) {
      console.error("[documents] getMyDocumentFn failed:", error);
      return null;
    }
  });

export const listMyDocumentsForRecordFn = createServerFn({ method: "GET" })
  .validator(z.object({ medicalRecordId: idSchema }))
  .handler(async ({ data }) => {
    const user = await requireRole("PATIENT");
    try {
      return await listPatientDocumentsForRecord(user.id, data.medicalRecordId);
    } catch (error) {
      console.error("[documents] listMyDocumentsForRecordFn failed:", error);
      return [];
    }
  });

// --- Shared: secure download ---------------------------------------------------

/**
 * Returns the file as base64 plus display metadata, never a filesystem
 * path or a guessable URL. The browser-side download button decodes this
 * into a `Blob` and triggers a save — there is no separate public HTTP
 * endpoint for document bytes in this codebase (see the README's "Medical
 * Documents" section for why: this TanStack Start version doesn't ship
 * file-based API routes, so every server-side operation — including this
 * one — goes through the same authenticated server-function boundary as
 * the rest of the app, not a raw `/api/...` route).
 *
 * Works for both roles: a doctor gets their own-appointment documents, a
 * patient gets their own documents. Not-found and not-authorized return
 * the identical `{ ok: false }` shape so neither leaks which case applied.
 */
export const downloadMedicalDocumentFn = createServerFn({ method: "GET" })
  .validator(documentIdSchema)
  .handler(
    async ({
      data,
    }): Promise<ActionResult<{ base64: string; mimeType: string; filename: string }>> => {
      try {
        const user = await requireAnyRole(["DOCTOR", "PATIENT"]);

        const document =
          user.role === "PATIENT"
            ? await getOwnedPatientDocument(user.id, data.documentId)
            : await (async () => {
                const doctor = await requireVerifiedDoctorRecord();
                return getOwnedDoctorDocument(doctor.id, data.documentId);
              })();

        if (!document) {
          // Same response whether the id is wrong or just not this
          // user's — never confirm existence to an unauthorized caller.
          return { ok: false, message: "Document not found." };
        }

        const bytes = await storage.get(document.storageKey);

        await recordAuthAuditEvent({
          actorUserId: user.id,
          action: "MEDICAL_DOCUMENT_DOWNLOADED",
          entityType: "medical_document",
          entityId: document.id,
          metadata: { appointmentId: document.appointmentId },
        });

        return {
          ok: true,
          base64: bytes.toString("base64"),
          mimeType: document.mimeType,
          filename: document.originalFilename,
        };
      } catch (error) {
        return { ok: false, ...toActionError(error) };
      }
    },
  );
