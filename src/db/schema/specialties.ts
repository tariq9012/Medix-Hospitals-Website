import {
  boolean,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { doctors } from "./doctors";
import { hospitals } from "./hospitals";

/**
 * A normalized list of medical specialties (Cardiology, Dermatology, ...).
 * Doctors and hospitals link to this table instead of storing specialty
 * names as arbitrary duplicated strings.
 */
export const specialties = pgTable("specialties", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 120 }).notNull().unique(),
  slug: varchar("slug", { length: 140 }).notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const doctorSpecialties = pgTable(
  "doctor_specialties",
  {
    doctorId: uuid("doctor_id")
      .notNull()
      .references(() => doctors.id, { onDelete: "cascade" }),
    specialtyId: uuid("specialty_id")
      .notNull()
      .references(() => specialties.id, { onDelete: "restrict" }),
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.doctorId, table.specialtyId] }),
    // The PK leads with doctor_id; specialty filters/counts need the reverse lookup.
    index("doctor_specialties_specialty_idx").on(table.specialtyId),
  ],
);

export const hospitalSpecialties = pgTable(
  "hospital_specialties",
  {
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    specialtyId: uuid("specialty_id")
      .notNull()
      .references(() => specialties.id, { onDelete: "restrict" }),
  },
  (table) => [
    primaryKey({ columns: [table.hospitalId, table.specialtyId] }),
    index("hospital_specialties_specialty_idx").on(table.specialtyId),
  ],
);

export type Specialty = typeof specialties.$inferSelect;
export type NewSpecialty = typeof specialties.$inferInsert;
