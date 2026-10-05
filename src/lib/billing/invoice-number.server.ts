import "@tanstack/react-start/server-only";

import { sql } from "drizzle-orm";

import type { db as dbInstance } from "@/db";

/** Accepts either the top-level `db` or a `db.transaction(async (tx) => ...)` callback's `tx` — both expose `.execute()`. */
type Executor = Pick<typeof dbInstance, "execute">;

/**
 * Generates the next invoice number as "MED-<year>-<6-digit sequence>", e.g.
 * "MED-2026-000123". Uses a Postgres SEQUENCE (`invoice_number_seq`,
 * created in migration 0008) rather than a `SELECT MAX(...) + 1` or a
 * counter row read-then-write: `nextval()` is atomic under concurrency by
 * design — two simultaneous callers can never get the same value, with no
 * row lock needed. The year is wall-clock at issuance time, not derived from
 * the sequence value.
 *
 * Call this INSIDE the same transaction that inserts the invoice row, and
 * still rely on the unique index on `invoices.invoice_number` as the final
 * safety net (per spec) — `nextval()` never rolls back even if the
 * surrounding transaction does, so in the (extremely unlikely) case of a
 * mid-transaction failure a sequence value is "burned" rather than reused,
 * which is the standard, correct tradeoff for this kind of counter.
 */
export async function nextInvoiceNumber(tx: Executor): Promise<string> {
  const result = await tx.execute<{ nextval: string }>(
    sql`select nextval('invoice_number_seq') as nextval`,
  );
  const seq = result[0]?.nextval;
  if (!seq) throw new Error("Failed to allocate an invoice number.");
  const year = new Date().getFullYear();
  return `MED-${year}-${seq.padStart(6, "0")}`;
}
