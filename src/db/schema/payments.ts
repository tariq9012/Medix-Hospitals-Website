import {
  index,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { paymentMethodEnum, paymentStatusEnum } from "./enums";
import { appointments } from "./appointments";
import { invoices } from "./billing";
import { users } from "./users";

/**
 * Provider-agnostic payment record. Deliberately not coupled to Stripe (or
 * any specific gateway) so a real integration can be added later without a
 * schema rewrite — `provider` + `providerPaymentId` identify the external
 * reference. Financial records are never cascade-deleted with the patient
 * account (`onDelete: "restrict"`).
 *
 * Phase 12: every payment belongs to exactly one invoice (`invoiceId`).
 * `paymentMethod` is a controlled enum (CASH/MANUAL/TEST) because there is
 * no real payment gateway in this phase — see `src/lib/billing/service.server.ts`.
 * `receiptNumber` and `idempotencyKey` were added for receipts and
 * duplicate-submit protection respectively; this table had zero rows before
 * Phase 12 (nothing wrote to it), so these are safe additive columns.
 */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "restrict" }),
    appointmentId: uuid("appointment_id").references(() => appointments.id, {
      onDelete: "set null",
    }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull().default("PKR"),
    status: paymentStatusEnum("status").notNull().default("PENDING"),
    /** e.g. "stripe", "manual", "cash" — no gateway integration in this phase. */
    provider: varchar("provider", { length: 50 }),
    providerPaymentId: varchar("provider_payment_id", { length: 200 }),
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    /** Human-readable receipt reference shown on the printable receipt, e.g. "RCPT-MED-2026-000123-1". */
    receiptNumber: varchar("receipt_number", { length: 40 }),
    /** Server-generated once per record-payment attempt in the UI; a repeat submit with the same key returns the original payment instead of creating a duplicate (§35). */
    idempotencyKey: varchar("idempotency_key", { length: 100 }),
    /** Who recorded this settlement (a Hospital Admin, or Platform Admin for hospital-less invoices) — never the patient. */
    recordedByUserId: uuid("recorded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("payments_invoice_created_idx").on(table.invoiceId, table.createdAt),
    index("payments_status_created_idx").on(table.status, table.createdAt),
    uniqueIndex("payments_receipt_number_unique").on(table.receiptNumber),
    uniqueIndex("payments_invoice_idempotency_unique").on(table.invoiceId, table.idempotencyKey),
  ],
);

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
