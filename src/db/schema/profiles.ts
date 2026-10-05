import { date, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { bloodGroupEnum, genderEnum } from "./enums";
import { users } from "./users";

/**
 * Patient-specific profile data, kept separate from `users` so the core
 * identity table stays lean and role-agnostic. One row per patient user.
 *
 * Deliberately does NOT hold clinical data (diagnoses, vitals, allergies,
 * etc.) — that lives in `medicalRecords` so this generic profile table isn't
 * over-collecting sensitive medical information.
 */
export const patientProfiles = pgTable("patient_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  firstName: varchar("first_name", { length: 120 }).notNull(),
  lastName: varchar("last_name", { length: 120 }).notNull(),
  phone: varchar("phone", { length: 30 }),
  dateOfBirth: date("date_of_birth"),
  gender: genderEnum("gender"),
  profileImage: text("profile_image"),
  address: text("address"),
  city: varchar("city", { length: 120 }),
  country: varchar("country", { length: 120 }),
  bloodGroup: bloodGroupEnum("blood_group"),
  emergencyContactName: varchar("emergency_contact_name", { length: 160 }),
  emergencyContactPhone: varchar("emergency_contact_phone", { length: 30 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PatientProfile = typeof patientProfiles.$inferSelect;
export type NewPatientProfile = typeof patientProfiles.$inferInsert;
