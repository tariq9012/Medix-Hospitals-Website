import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { hospitals } from "./hospitals";

/**
 * Departments belonging to a specific hospital. Scoped by `hospitalId` so a
 * hospital admin can only ever list or modify their own — enforced in
 * `src/lib/hospital/departments.server.ts`, never by a client-supplied id.
 *
 * Departments are disabled (`isActive = false`) rather than deleted, since
 * `hospital_doctors.department` and future records may reference them by
 * name and shouldn't be silently orphaned.
 */
export const hospitalDepartments = pgTable(
  "hospital_departments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 150 }).notNull(),
    slug: varchar("slug", { length: 170 }).notNull(),
    description: text("description"),
    phoneExtension: varchar("phone_extension", { length: 30 }),
    location: varchar("location", { length: 150 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Unique per hospital, not globally — two hospitals may both have "Cardiology".
    unique("hospital_departments_hospital_slug_unique").on(table.hospitalId, table.slug),
    index("hospital_departments_hospital_active_idx").on(table.hospitalId, table.isActive),
  ],
);

export type HospitalDepartment = typeof hospitalDepartments.$inferSelect;
export type NewHospitalDepartment = typeof hospitalDepartments.$inferInsert;
