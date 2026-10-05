import {
  check,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { moderationStatusEnum } from "./enums";
import { appointments } from "./appointments";
import { doctors } from "./doctors";
import { hospitals } from "./hospitals";
import { users } from "./users";

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    doctorId: uuid("doctor_id").references(() => doctors.id, { onDelete: "cascade" }),
    hospitalId: uuid("hospital_id").references(() => hospitals.id, { onDelete: "cascade" }),
    /**
     * Optional link back to the completed appointment the review is about.
     * The unique constraint below only applies to non-null values (Postgres
     * treats each NULL as distinct), so this quietly prevents more than one
     * review per appointment without blocking reviews that aren't tied to one.
     */
    appointmentId: uuid("appointment_id").references(() => appointments.id, {
      onDelete: "set null",
    }),
    rating: smallint("rating").notNull(),
    title: varchar("title", { length: 200 }),
    reviewText: text("review_text"),
    /**
     * Visibility lifecycle. Reviews created through the verified-appointment
     * flow are inserted as PUBLISHED. HIDDEN rows are never deleted — they
     * keep their content/history and are simply excluded from every public
     * query and aggregate.
     */
    moderationStatus: moderationStatusEnum("moderation_status").notNull().default("PENDING"),
    /** Set when status becomes HIDDEN. `hiddenByUserId` = the patient (self-removal) or a platform admin (moderation). */
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    hiddenReason: text("hidden_reason"),
    hiddenByUserId: uuid("hidden_by_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Set only when the patient edits their own review text/rating after posting. */
    editedAt: timestamp("edited_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("reviews_rating_range", sql`${table.rating} >= 1 AND ${table.rating} <= 5`),
    check(
      "reviews_target_present",
      sql`${table.doctorId} IS NOT NULL OR ${table.hospitalId} IS NOT NULL`,
    ),
    unique("reviews_appointment_unique").on(table.appointmentId),
    // Defence in depth behind the service-layer validation.
    check(
      "reviews_text_length",
      sql`${table.reviewText} IS NULL OR char_length(${table.reviewText}) <= 2000`,
    ),
    check(
      "reviews_hidden_has_timestamp",
      sql`${table.moderationStatus} <> 'HIDDEN' OR ${table.hiddenAt} IS NOT NULL`,
    ),
    // Public profile pages + aggregates filter on (doctor, status) and order by date.
    index("reviews_doctor_status_created_idx").on(
      table.doctorId,
      table.moderationStatus,
      table.createdAt,
    ),
    index("reviews_hospital_status_idx").on(table.hospitalId, table.moderationStatus),
    index("reviews_patient_idx").on(table.patientId),
  ],
);

export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
