import {
  date,
  index,
  numeric,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { appointmentStatusEnum, consultationTypeEnum, paymentStatusEnum } from "./enums";
import { doctors } from "./doctors";
import { hospitals } from "./hospitals";
import { users } from "./users";

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Patients are referenced through the central user identity (see users.ts);
    // doctors are referenced through their domain-specific record.
    patientId: uuid("patient_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    doctorId: uuid("doctor_id")
      .notNull()
      .references(() => doctors.id, { onDelete: "restrict" }),
    /** Null for a purely online consultation with no physical location. */
    hospitalId: uuid("hospital_id").references(() => hospitals.id, { onDelete: "set null" }),
    appointmentDate: date("appointment_date").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    consultationType: consultationTypeEnum("consultation_type").notNull().default("IN_PERSON"),
    reasonForVisit: text("reason_for_visit"),
    patientNotes: text("patient_notes"),
    status: appointmentStatusEnum("status").notNull().default("PENDING"),
    paymentStatus: paymentStatusEnum("payment_status").notNull().default("PENDING"),
    fee: numeric("fee", { precision: 10, scale: 2 }),
    cancellationReason: text("cancellation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The database-level double-booking guard: two non-cancelled
    // appointments can never occupy the same doctor + date + start time.
    // Postgres treats each row independently at INSERT time, so this holds
    // even under concurrent requests — unlike a "check then insert" in
    // application code, which can race.
    uniqueIndex("appointments_doctor_slot_unique")
      .on(table.doctorId, table.appointmentDate, table.startTime)
      .where(sql`${table.status} <> 'CANCELLED'`),
    index("appointments_doctor_date_idx").on(table.doctorId, table.appointmentDate),
    index("appointments_patient_date_idx").on(table.patientId, table.appointmentDate),
    index("appointments_status_date_idx").on(table.status, table.appointmentDate),
    // Hospital Portal lists every appointment for one hospital by date.
    index("appointments_hospital_date_idx").on(table.hospitalId, table.appointmentDate),
  ],
);

export type Appointment = typeof appointments.$inferSelect;
export type NewAppointment = typeof appointments.$inferInsert;
