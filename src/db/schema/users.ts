import {
  boolean,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { userRoleEnum, userStatusEnum } from "./enums";

/**
 * The single authenticated identity for the platform. Every role (patient,
 * doctor, hospital admin, platform admin) is a `users` row first; role-specific
 * data lives in its own table (see `patientProfiles`, `doctors`, and the
 * hospital-admin relationship implied by `hospitals`).
 *
 * Authentication itself (password hashing/verification, sessions, OAuth) is
 * implemented in Phase 3 — this table only prepares the data model for it.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    /** Never store plaintext passwords — this holds a bcrypt/argon2 hash. */
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    role: userRoleEnum("role").notNull().default("PATIENT"),
    status: userStatusEnum("status").notNull().default("ACTIVE"),
    emailVerified: boolean("email_verified").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("users_email_unique_idx").on(table.email),
    index("users_role_status_idx").on(table.role, table.status),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
