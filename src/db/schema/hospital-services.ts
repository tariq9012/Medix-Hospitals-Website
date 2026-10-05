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
 * Services a hospital offers. This is the relational replacement for the
 * free-text `hospitals.facilities` array, which stays in place for the
 * existing public hospital pages — see the Phase 7 known limitations.
 *
 * Deliberately has no price column: billing is a later phase, and adding a
 * price here now would imply a charging model that doesn't exist yet.
 */
export const hospitalServices = pgTable(
  "hospital_services",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 150 }).notNull(),
    slug: varchar("slug", { length: 170 }).notNull(),
    description: text("description"),
    category: varchar("category", { length: 100 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("hospital_services_hospital_slug_unique").on(table.hospitalId, table.slug),
    index("hospital_services_hospital_active_idx").on(table.hospitalId, table.isActive),
  ],
);

export type HospitalService = typeof hospitalServices.$inferSelect;
export type NewHospitalService = typeof hospitalServices.$inferInsert;
