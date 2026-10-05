import { index, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { paymentMethodEnum, refundStatusEnum } from "./enums";
import { invoices } from "./billing";
import { payments } from "./payments";
import { users } from "./users";

/**
 * An internal ledger entry recording that money was handed back to a
 * patient OUTSIDE this system (cash returned, a manual bank transfer done by
 * hospital staff, etc.) — Phase 12 has no payment gateway, so there is no
 * real reversal to trigger. A refund never deletes or mutates the original
 * `payments` row; history is additive only (§20/§50).
 *
 * `invoiceId` is denormalized from `paymentId` (a payment always belongs to
 * one invoice) so hospital/admin refund listings can query by invoice
 * directly, without a join, for pagination/filtering (§36/§37).
 */
export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "restrict" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "restrict" }),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    reason: text("reason").notNull(),
    status: refundStatusEnum("status").notNull().default("COMPLETED"),
    method: paymentMethodEnum("method").notNull(),
    processedByUserId: uuid("processed_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("refunds_payment_created_idx").on(table.paymentId, table.createdAt),
    index("refunds_invoice_created_idx").on(table.invoiceId, table.createdAt),
  ],
);

export type Refund = typeof refunds.$inferSelect;
export type NewRefund = typeof refunds.$inferInsert;
