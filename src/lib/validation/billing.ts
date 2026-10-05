import { z } from "zod";

import { idSchema } from "./common";

export const invoiceStatusFilterSchema = z.enum([
  "DRAFT",
  "ISSUED",
  "PARTIALLY_PAID",
  "PAID",
  "VOID",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
]);

export const invoiceListFiltersSchema = z.object({
  status: invoiceStatusFilterSchema.optional(),
  search: z.string().trim().max(200).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
});

export const paymentMethodSchema = z.enum(["CASH", "MANUAL", "TEST"]);

/**
 * `amount` arrives as a string (never a JS number) so the exact decimal
 * value the staff member typed is preserved end to end — no floating-point
 * round-tripping. Still just client input: the server independently
 * re-validates it against the invoice's real outstanding/refundable balance
 * (never trusted, per spec §13).
 */
const moneyAmountSchema = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, "Enter a valid amount, e.g. 1500 or 1500.50");

export const recordPaymentSchema = z.object({
  invoiceId: idSchema,
  amount: moneyAmountSchema,
  method: paymentMethodSchema,
  /** Generated once client-side per record-payment attempt (a fresh UUID each time the dialog opens); repeat submits with the same key return the original result instead of double-charging (spec §35). */
  idempotencyKey: z.string().uuid().optional(),
});

export const recordRefundSchema = z.object({
  paymentId: idSchema,
  amount: moneyAmountSchema,
  reason: z.string().trim().min(1, "A refund reason is required.").max(500),
});
