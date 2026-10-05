import {
  index,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { invoiceStatusEnum } from "./enums";
import { appointments } from "./appointments";
import { doctors } from "./doctors";
import { hospitals } from "./hospitals";
import { users } from "./users";

/**
 * Phase 12: one invoice per appointment (enforced below with a unique
 * index — never relies on UI checks alone). Created when the doctor
 * CONFIRMS the appointment (see `src/lib/billing/service.server.ts` for the
 * documented policy rationale), using the appointment's already-trusted fee
 * snapshot — never the doctor's *current* consultation fee.
 *
 * Money columns are `numeric(10,2)` decimal strings, matching the
 * pre-existing `appointments.fee` / `doctors.consultationFee` convention
 * (see `src/lib/billing/money.ts` for why this phase does not switch to
 * integer minor units). All arithmetic on these columns must go through
 * that module — never `parseFloat` / native `+`.
 */
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Human-readable, e.g. "MED-2026-000123". Generated server-side from a DB sequence — never trusted from the client. */
    invoiceNumber: varchar("invoice_number", { length: 32 }).notNull(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    doctorId: uuid("doctor_id")
      .notNull()
      .references(() => doctors.id, { onDelete: "restrict" }),
    /** Null when the appointment itself has no hospital (pure online consult with no affiliated site). */
    hospitalId: uuid("hospital_id").references(() => hospitals.id, { onDelete: "set null" }),
    appointmentId: uuid("appointment_id")
      .notNull()
      .references(() => appointments.id, { onDelete: "restrict" }),
    currency: varchar("currency", { length: 10 }).notNull().default("PKR"),
    subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
    discount: numeric("discount", { precision: 10, scale: 2 }).notNull().default("0.00"),
    tax: numeric("tax", { precision: 10, scale: 2 }).notNull().default("0.00"),
    total: numeric("total", { precision: 10, scale: 2 }).notNull(),
    amountPaid: numeric("amount_paid", { precision: 10, scale: 2 }).notNull().default("0.00"),
    amountRefunded: numeric("amount_refunded", { precision: 10, scale: 2 })
      .notNull()
      .default("0.00"),
    status: invoiceStatusEnum("status").notNull().default("ISSUED"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("invoices_invoice_number_unique").on(table.invoiceNumber),
    // One invoice per appointment — enforced at the database, not just in application code.
    uniqueIndex("invoices_appointment_unique").on(table.appointmentId),
    index("invoices_patient_created_idx").on(table.patientId, table.createdAt),
    index("invoices_hospital_created_idx").on(table.hospitalId, table.createdAt),
    index("invoices_status_created_idx").on(table.status, table.createdAt),
  ],
);

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
