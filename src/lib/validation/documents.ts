import { z } from "zod";

import { idSchema } from "./common";

export const documentTypeSchema = z.enum([
  "LAB_REPORT",
  "IMAGING_REPORT",
  "DIAGNOSTIC_REPORT",
  "DISCHARGE_SUMMARY",
  "REFERRAL",
  "CLINICAL_ATTACHMENT",
  "OTHER",
]);

/**
 * Metadata for a document upload. Deliberately has no `patientId`,
 * `doctorId`, `hospitalId`, `storageKey`, `mimeType`, `fileSize`, or
 * `checksum` field — all of those are derived server-side (from the
 * appointment, from the uploaded file itself, or from the storage layer),
 * never accepted as client input. The actual file bytes travel alongside
 * this metadata as a separate `FormData` field, validated by
 * `src/lib/documents/file-validation.server.ts`, not by Zod.
 */
export const uploadMedicalDocumentMetadataSchema = z.object({
  appointmentId: idSchema,
  medicalRecordId: idSchema.optional(),
  documentType: documentTypeSchema,
  title: z.string().trim().min(2, "Title must be at least 2 characters.").max(200),
  description: z.string().trim().max(1000).optional(),
});

export const documentIdSchema = z.object({ documentId: idSchema });

export type UploadMedicalDocumentMetadata = z.infer<typeof uploadMedicalDocumentMetadataSchema>;
