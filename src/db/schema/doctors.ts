import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { verificationStatusEnum } from "./enums";
import { users } from "./users";

/**
 * Professional/domain data for a DOCTOR-role user. Specialties are
 * normalized via `doctorSpecialties` (see `specialties.ts`) rather than
 * stored as a free-text column here.
 */
export const doctors = pgTable(
  "doctors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "restrict" }),
    firstName: varchar("first_name", { length: 120 }).notNull(),
    lastName: varchar("last_name", { length: 120 }).notNull(),
    /** Public-profile URL slug, e.g. /doctors/dr-ahmed-raza. */
    slug: varchar("slug", { length: 160 }).notNull().unique(),
    profileImage: text("profile_image"),
    qualifications: text("qualifications").array(),
    biography: text("biography"),
    yearsOfExperience: integer("years_of_experience"),
    medicalLicenseNumber: varchar("medical_license_number", { length: 100 }).unique(),
    consultationFee: numeric("consultation_fee", { precision: 10, scale: 2 }),
    verificationStatus: verificationStatusEnum("verification_status").notNull().default("PENDING"),
    /**
     * The reason behind the CURRENT rejected/suspended state, denormalized
     * here for quick display. The full decision history (including previous
     * reasons) lives in `provider_verification_events`.
     */
    verificationReason: text("verification_reason"),
    verificationReviewedAt: timestamp("verification_reviewed_at", { withTimezone: true }),
    isAvailable: boolean("is_available").notNull().default(true),
    /**
     * @deprecated Phase 13: NOT a source of truth and no longer read anywhere.
     * Public ratings are derived at query time from PUBLISHED rows in
     * `reviews` (see src/lib/reviews/aggregate.server.ts), so they cannot
     * drift. Columns are kept only to avoid a destructive migration.
     */
    rating: numeric("rating", { precision: 3, scale: 2 }).notNull().default("0"),
    totalReviews: integer("total_reviews").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("doctors_verification_status_idx").on(table.verificationStatus)],
);

export type Doctor = typeof doctors.$inferSelect;
export type NewDoctor = typeof doctors.$inferInsert;
