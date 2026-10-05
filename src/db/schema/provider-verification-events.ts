import { index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { verificationStatusEnum } from "./enums";
import { users } from "./users";

export const providerTypeEnum = pgEnum("provider_type", ["DOCTOR", "HOSPITAL"]);

/**
 * A permanent, append-only record of every provider verification decision.
 *
 * `providerId` is deliberately NOT a foreign key: it points at either a
 * `doctors.id` or a `hospitals.id` depending on `providerType`, and more
 * importantly the compliance trail must survive even if a provider record
 * is later removed. `reviewedByUserId` uses `set null` for the same reason —
 * the event outlives the admin account that made the decision.
 */
export const providerVerificationEvents = pgTable(
  "provider_verification_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    providerType: providerTypeEnum("provider_type").notNull(),
    providerId: uuid("provider_id").notNull(),
    previousStatus: verificationStatusEnum("previous_status").notNull(),
    newStatus: verificationStatusEnum("new_status").notNull(),
    /** Required for REJECTED and SUSPENDED decisions; optional otherwise. */
    reason: text("reason"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("provider_verification_events_provider_idx").on(table.providerType, table.providerId),
    index("provider_verification_events_created_idx").on(table.createdAt),
  ],
);

export type ProviderVerificationEvent = typeof providerVerificationEvents.$inferSelect;
export type NewProviderVerificationEvent = typeof providerVerificationEvents.$inferInsert;
