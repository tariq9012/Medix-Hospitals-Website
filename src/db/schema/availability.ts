import { boolean, index, integer, pgTable, time, timestamp, uuid } from "drizzle-orm/pg-core";

import { consultationTypeEnum, dayOfWeekEnum } from "./enums";
import { doctors } from "./doctors";
import { hospitals } from "./hospitals";

/**
 * A recurring weekly availability window for a doctor. Bookable slots are
 * generated on demand from these rules (see
 * `src/lib/appointments/availability.server.ts`) rather than stored as
 * permanent future rows — a rule change immediately affects all not-yet-
 * booked future dates without a backfill.
 */
export const doctorAvailability = pgTable(
  "doctor_availability",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    doctorId: uuid("doctor_id")
      .notNull()
      .references(() => doctors.id, { onDelete: "cascade" }),
    /** Null when the slot is online-only (no physical location). */
    hospitalId: uuid("hospital_id").references(() => hospitals.id, { onDelete: "set null" }),
    dayOfWeek: dayOfWeekEnum("day_of_week").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    slotDurationMinutes: integer("slot_duration_minutes").notNull().default(30),
    consultationType: consultationTypeEnum("consultation_type").notNull().default("IN_PERSON"),
    breakStartTime: time("break_start_time"),
    breakEndTime: time("break_end_time"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("doctor_availability_doctor_day_idx").on(table.doctorId, table.dayOfWeek)],
);

export type DoctorAvailability = typeof doctorAvailability.$inferSelect;
export type NewDoctorAvailability = typeof doctorAvailability.$inferInsert;
