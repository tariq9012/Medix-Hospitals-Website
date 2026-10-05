import { index, integer, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { documentTypeEnum } from "./enums";
import { appointments } from "./appointments";
import { doctors } from "./doctors";
import { hospitals } from "./hospitals";
import { medicalRecords } from "./medical-records";
import { users } from "./users";

/**
 * Medical document METADATA only — lab reports, imaging, discharge
 * summaries, referrals, and other clinical attachments. The file bytes
 * themselves are never stored here; `storageKey` is an opaque pointer into
 * the storage abstraction (`src/lib/storage/`), never a filesystem path or
 * public URL. See `src/lib/documents/` for the authorization, upload, and
 * secure-download logic that sits in front of this table.
 */
export const medicalDocuments = pgTable(
  "medical_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    doctorId: uuid("doctor_id").references(() => doctors.id, { onDelete: "set null" }),
    appointmentId: uuid("appointment_id").references(() => appointments.id, {
      onDelete: "set null",
    }),
    medicalRecordId: uuid("medical_record_id").references(() => medicalRecords.id, {
      onDelete: "set null",
    }),
    /** Denormalized from the appointment at upload time for fast, join-free access checks. */
    hospitalId: uuid("hospital_id").references(() => hospitals.id, { onDelete: "set null" }),
    documentType: documentTypeEnum("document_type").notNull().default("OTHER"),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    /** The name the uploader's browser sent — display metadata only, NEVER used to build a filesystem path. */
    originalFilename: varchar("original_filename", { length: 255 }).notNull(),
    /** Opaque key into the storage abstraction (see src/lib/storage/types.ts). Never a raw filesystem path or public URL. */
    storageKey: text("storage_key").notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    fileSize: integer("file_size").notNull(),
    /** SHA-256 hex digest of the file bytes, for integrity/duplicate checks. */
    checksum: varchar("checksum", { length: 64 }).notNull(),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("medical_documents_patient_date_idx").on(table.patientId, table.createdAt),
    index("medical_documents_doctor_date_idx").on(table.doctorId, table.createdAt),
    index("medical_documents_appointment_idx").on(table.appointmentId),
    index("medical_documents_medical_record_idx").on(table.medicalRecordId),
  ],
);

export type MedicalDocument = typeof medicalDocuments.$inferSelect;
export type NewMedicalDocument = typeof medicalDocuments.$inferInsert;
