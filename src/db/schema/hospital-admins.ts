import { boolean, index, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { hospitals } from "./hospitals";
import { users } from "./users";

/**
 * Explicit, server-enforced link between a HOSPITAL_ADMIN user and the
 * hospital(s) they're authorized to manage. This closes the Phase 5
 * limitation where a hospital-admin account had no reliable hospital
 * association.
 *
 * Modeled as a junction table rather than a `hospitalId` column on `users`
 * so a hospital can have several authorized admins (and, if ever needed, an
 * admin can cover more than one site) without a schema change.
 *
 * `requireHospitalAdmin()` resolves this relationship from the session —
 * a hospital id supplied by the browser is never trusted on its own.
 */
export const hospitalAdmins = pgTable(
  "hospital_admins",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    /** Marks the primary contact when a hospital has several admins. */
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("hospital_admins_user_hospital_unique").on(table.userId, table.hospitalId),
    index("hospital_admins_user_idx").on(table.userId),
    index("hospital_admins_hospital_idx").on(table.hospitalId),
  ],
);

export type HospitalAdmin = typeof hospitalAdmins.$inferSelect;
export type NewHospitalAdmin = typeof hospitalAdmins.$inferInsert;
