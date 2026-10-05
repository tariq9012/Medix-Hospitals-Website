import {
  boolean,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { verificationStatusEnum } from "./enums";
import { doctors } from "./doctors";

export const hospitals = pgTable(
  "hospitals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 200 }).notNull().unique(),
    description: text("description"),
    logo: text("logo"),
    coverImage: text("cover_image"),
    phone: varchar("phone", { length: 30 }),
    email: varchar("email", { length: 255 }),
    address: text("address"),
    city: varchar("city", { length: 120 }),
    country: varchar("country", { length: 120 }),
    latitude: numeric("latitude", { precision: 9, scale: 6 }),
    longitude: numeric("longitude", { precision: 9, scale: 6 }),
    verificationStatus: verificationStatusEnum("verification_status").notNull().default("PENDING"),
    /** Reason for the CURRENT rejected/suspended state; full history lives in `provider_verification_events`. */
    verificationReason: text("verification_reason"),
    verificationReviewedAt: timestamp("verification_reviewed_at", { withTimezone: true }),
    /**
     * Structured opening hours, e.g. { "monday": { "open": "09:00", "close": "21:00" }, ... }.
     * Kept as JSONB rather than a dedicated table since it's read as a whole
     * unit and doesn't need to be queried/filtered on individually yet.
     */
    openingHours: jsonb("opening_hours").$type<Record<string, { open: string; close: string }>>(),
    /** Free-form amenity labels (e.g. "24/7 Emergency", "ICU", "Pharmacy"). */
    facilities: text("facilities").array(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("hospitals_verification_status_idx").on(table.verificationStatus)],
);

/**
 * A doctor may practice at one or more hospitals, and a hospital has many
 * doctors — classic many-to-many, modeled explicitly rather than as an array
 * on either side.
 */
export const hospitalDoctors = pgTable(
  "hospital_doctors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    doctorId: uuid("doctor_id")
      .notNull()
      .references(() => doctors.id, { onDelete: "cascade" }),
    department: varchar("department", { length: 120 }),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // A doctor should only be linked to the same hospital once.
    unique("hospital_doctors_hospital_doctor_unique").on(table.hospitalId, table.doctorId),
    index("hospital_doctors_hospital_idx").on(table.hospitalId),
    index("hospital_doctors_doctor_idx").on(table.doctorId),
  ],
);

export type Hospital = typeof hospitals.$inferSelect;
export type NewHospital = typeof hospitals.$inferInsert;
export type HospitalDoctor = typeof hospitalDoctors.$inferSelect;
