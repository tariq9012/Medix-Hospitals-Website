import {
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { appointments } from "./appointments";
import { doctors } from "./doctors";
import { hospitals } from "./hospitals";
import { users } from "./users";

/**
 * Sensitive clinical data. This table must never be exposed through public
 * or unauthenticated APIs — access should always be scoped to the owning
 * patient, the treating doctor, and authorized admin/audit flows.
 *
 * Phase 8: one primary record per completed appointment. Enforced with a
 * real unique index on `appointment_id` (not just "check then insert" in
 * application code, which can race under concurrent requests) — Postgres
 * allows a NULL appointment_id to repeat, but any real appointment id can
 * back at most one record.
 */
export const medicalRecords = pgTable(
  "medical_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    doctorId: uuid("doctor_id").references(() => doctors.id, { onDelete: "set null" }),
    appointmentId: uuid("appointment_id").references(() => appointments.id, {
      onDelete: "set null",
    }),
    /** Denormalized from the appointment at creation time for fast, join-free access checks. */
    hospitalId: uuid("hospital_id").references(() => hospitals.id, { onDelete: "set null" }),
    chiefComplaint: text("chief_complaint"),
    diagnosis: text("diagnosis"),
    symptoms: text("symptoms").array(),
    clinicalNotes: text("clinical_notes"),
    allergies: text("allergies").array(),
    /** Structured vitals snapshot, e.g. { bloodPressure, heartRate, temperature, weight, height }. */
    vitals: jsonb("vitals").$type<Record<string, string | number>>(),
    treatmentNotes: text("treatment_notes"),
    treatmentPlan: text("treatment_plan"),
    followUpInstructions: text("follow_up_instructions"),
    followUpDate: date("follow_up_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One primary medical record per appointment, enforced at the database
    // level. NULLs (records not tied to an appointment) don't collide.
    uniqueIndex("medical_records_appointment_unique").on(table.appointmentId),
    index("medical_records_patient_date_idx").on(table.patientId, table.createdAt),
    index("medical_records_doctor_date_idx").on(table.doctorId, table.createdAt),
  ],
);

export type MedicalRecord = typeof medicalRecords.$inferSelect;
export type NewMedicalRecord = typeof medicalRecords.$inferInsert;
