import { index, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { users } from "./users";

/**
 * Single-use, expiring password-reset tokens. Only a hash of the raw token
 * is stored (the raw token is emailed to the user and never persisted) so a
 * database leak can't be used to reset accounts.
 */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 128 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** Set once the token has been redeemed — makes it single-use. */
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("password_reset_tokens_user_idx").on(table.userId)],
);

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;
