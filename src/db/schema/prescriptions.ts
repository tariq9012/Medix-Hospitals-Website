import { date, index, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { prescriptionStatusEnum } from "./enums";
import { appointments } from "./appointments";
import { doctors } from "./doctors";
import { hospitals } from "./hospitals";
import { medicalRecords } from "./medical-records";
import { users } from "./users";

export const prescriptions = pgTable(
  "prescriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    doctorId: uuid("doctor_id")
      .notNull()
      .references(() => doctors.id, { onDelete: "restrict" }),
    appointmentId: uuid("appointment_id").references(() => appointments.id, {
      onDelete: "set null",
    }),
    /** The clinical record this prescription was issued alongside, when one exists. */
    medicalRecordId: uuid("medical_record_id").references(() => medicalRecords.id, {
      onDelete: "set null",
    }),
    /** Denormalized from the appointment at creation time for fast, join-free access checks. */
    hospitalId: uuid("hospital_id").references(() => hospitals.id, { onDelete: "set null" }),
    issuedDate: date("issued_date").notNull().defaultNow(),
    notes: text("notes"),
    status: prescriptionStatusEnum("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("prescriptions_appointment_idx").on(table.appointmentId),
    index("prescriptions_patient_date_idx").on(table.patientId, table.createdAt),
    index("prescriptions_doctor_date_idx").on(table.doctorId, table.createdAt),
  ],
);

/**
 * Individual medicine line items for a prescription, kept as structured
 * child rows rather than one large unstructured text blob.
 */
export const prescriptionItems = pgTable(
  "prescription_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    prescriptionId: uuid("prescription_id")
      .notNull()
      .references(() => prescriptions.id, { onDelete: "cascade" }),
    medicineName: varchar("medicine_name", { length: 200 }).notNull(),
    dosage: varchar("dosage", { length: 100 }),
    frequency: varchar("frequency", { length: 100 }),
    duration: varchar("duration", { length: 100 }),
    route: varchar("route", { length: 50 }),
    instructions: text("instructions"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("prescription_items_prescription_idx").on(table.prescriptionId)],
);

export type Prescription = typeof prescriptions.$inferSelect;
export type NewPrescription = typeof prescriptions.$inferInsert;
export type PrescriptionItem = typeof prescriptionItems.$inferSelect;
export type NewPrescriptionItem = typeof prescriptionItems.$inferInsert;
