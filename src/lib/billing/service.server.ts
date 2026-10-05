import "@tanstack/react-start/server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  appointments,
  doctors,
  hospitals,
  invoices,
  payments,
  refunds,
  users,
  type Invoice,
  type Payment,
  type Refund,
} from "@/db/schema";
import { recordAuthAuditEvent } from "@/lib/auth/audit.server";
import { createNotification } from "@/lib/notifications/service.server";

import { BillingError } from "./errors";
import { nextInvoiceNumber } from "./invoice-number.server";
import {
  addMoney,
  compareMoney,
  DEFAULT_CURRENCY,
  formatMoney,
  isPositiveAmount,
  subtractMoney,
} from "./money";

/** A `db.transaction(async (tx) => ...)` callback's `tx`, or `db` itself — both support the same query builder surface these functions need. */
type Executor = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Invoice creation policy (Phase 12 spec §8, chosen after auditing the
 * booking flow): an invoice is created when the DOCTOR CONFIRMS the
 * appointment — not at booking time. Rationale: the appointment's fee is
 * already snapshotted at booking (`appointments.fee`, copied once from
 * `doctors.consultationFee` and never re-read afterwards — see
 * `src/lib/appointments/service.server.ts`), but a PENDING appointment can
 * still be rejected/never confirmed, and billing a visit that never
 * happened would be wrong. CONFIRM is the single, existing state
 * transition in the codebase (`applyDoctorAppointmentAction`) that marks an
 * appointment as a real, committed visit — so it is the one consistent hook
 * point. This function is called from INSIDE that same transaction.
 *
 * Idempotent: relies on the unique index on `invoices.appointment_id`. If a
 * duplicate call somehow races (should already be prevented by the CONFIRM
 * transition's own optimistic status guard), the conflict is swallowed and
 * the existing invoice is returned instead of erroring.
 */
export async function createInvoiceForAppointment(
  tx: Executor,
  appointment: {
    id: string;
    patientId: string;
    doctorId: string;
    hospitalId: string | null;
    fee: string | null;
  },
): Promise<Invoice> {
  if (!appointment.fee || !isPositiveAmount(appointment.fee)) {
    throw new BillingError("Appointment has no valid fee snapshot to invoice.");
  }

  const invoiceNumber = await nextInvoiceNumber(tx);
  const now = new Date();

  const [created] = await tx
    .insert(invoices)
    .values({
      invoiceNumber,
      patientId: appointment.patientId,
      doctorId: appointment.doctorId,
      hospitalId: appointment.hospitalId,
      appointmentId: appointment.id,
      currency: DEFAULT_CURRENCY,
      subtotal: appointment.fee,
      discount: "0.00",
      tax: "0.00",
      total: appointment.fee,
      amountPaid: "0.00",
      amountRefunded: "0.00",
      status: "ISSUED",
      issuedAt: now,
    })
    .onConflictDoNothing({ target: invoices.appointmentId })
    .returning();

  const invoice =
    created ??
    (await tx.query.invoices.findFirst({ where: eq(invoices.appointmentId, appointment.id) }));
  if (!invoice)
    throw new BillingError("Failed to create or locate the invoice for this appointment.");
  return invoice;
}

/**
 * Fire-and-forget-style post-commit side effects for a newly issued invoice.
 * Never call inside the DB transaction. `actorUserId` is whoever's action
 * triggered issuance (the confirming doctor), for the audit trail.
 */
export async function afterInvoiceIssued(invoice: Invoice, actorUserId: string): Promise<void> {
  await recordAuthAuditEvent({
    actorUserId,
    action: "INVOICE_CREATED",
    entityType: "invoice",
    entityId: invoice.id,
    metadata: {
      appointmentId: invoice.appointmentId,
      amount: invoice.total,
      currency: invoice.currency,
    },
  }).catch((error) => console.error("[billing] audit log failed:", error));

  await createNotification({
    userId: invoice.patientId,
    type: "INVOICE_ISSUED",
    title: "New invoice",
    message: `Invoice ${invoice.invoiceNumber} for ${formatMoney(invoice.total, invoice.currency)} is ready.`,
    metadata: { invoiceId: invoice.id },
  }).catch((error) => console.error("[billing] notification failed:", error));
}

/**
 * Cancellation billing policy (Phase 12 spec §23, a documented choice):
 *  - unpaid invoice (amountPaid = 0) + cancelled appointment -> VOID it.
 *  - any invoice with amountPaid > 0 -> left exactly as-is (PAID or
 *    PARTIALLY_PAID). Money already collected is never auto-refunded or
 *    silently voided; an authorized Hospital/Platform Admin must use the
 *    explicit refund workflow. The hospital billing list flags this case
 *    (cancelled appointment + outstanding refundable balance) so it isn't
 *    missed, but nothing happens automatically.
 * A cancelled appointment that was never confirmed has no invoice yet
 * (invoices are only created at CONFIRM) — this is a no-op for it.
 */
export async function voidInvoiceForCancelledAppointment(
  tx: Executor,
  appointmentId: string,
): Promise<void> {
  const invoice = await tx.query.invoices.findFirst({
    where: eq(invoices.appointmentId, appointmentId),
  });
  if (!invoice) return; // never confirmed / never invoiced — nothing to do
  if (invoice.status !== "ISSUED" || compareMoney(invoice.amountPaid, "0.00") !== 0) return; // paid (partially or fully): leave alone, see policy above

  await tx
    .update(invoices)
    .set({ status: "VOID", updatedAt: new Date() })
    .where(eq(invoices.id, invoice.id));
}

interface RecordPaymentInput {
  actorUserId: string;
  /** Hospital ids this actor may act for; `null` means the actor is a Platform Admin (may only act on hospital-less invoices — see the authorization check below). */
  hospitalIds: string[] | null;
  invoiceId: string;
  amount: string;
  method: "CASH" | "MANUAL" | "TEST";
  idempotencyKey?: string;
}

/**
 * Records that money was collected for an invoice. There is no payment
 * gateway in Phase 12 — this is staff attesting that a real-world CASH/bank
 * settlement happened, never a live card charge (spec §2/§34).
 *
 * Concurrency (spec §17/§18): the invoice row is locked with
 * `SELECT ... FOR UPDATE` for the whole transaction, so two simultaneous
 * "record payment" calls for the same invoice are fully serialized by
 * PostgreSQL — the second sees the first payment's committed effect before
 * it can proceed, so overpayment is impossible even under a real
 * concurrent-request race (verified in `tests/billing/concurrency.test.ts`).
 * The final UPDATE also carries a compare-and-swap WHERE guard as
 * defense-in-depth, matching this codebase's established style elsewhere.
 */
export async function recordPayment(
  input: RecordPaymentInput,
): Promise<{ invoice: Invoice; payment: Payment; alreadyRecorded: boolean }> {
  if (!isPositiveAmount(input.amount)) {
    throw new BillingError("Payment amount must be a positive number.");
  }

  const result = await db.transaction(async (tx) => {
    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.id, input.invoiceId))
      .for("update");
    if (!invoice) throw new BillingError("Invoice not found.");

    assertHospitalAuthorized(invoice, input.hospitalIds);

    if (input.idempotencyKey) {
      const existing = await tx.query.payments.findFirst({
        where: and(
          eq(payments.invoiceId, invoice.id),
          eq(payments.idempotencyKey, input.idempotencyKey),
        ),
      });
      if (existing) return { invoice, payment: existing, alreadyRecorded: true };
    }

    if (invoice.status === "VOID")
      throw new BillingError("This invoice has been voided and cannot accept payment.");
    if (invoice.status === "REFUNDED")
      throw new BillingError("This invoice has already been fully refunded.");

    const outstanding = subtractMoney(invoice.total, invoice.amountPaid);
    if (compareMoney(input.amount, outstanding) > 0) {
      throw new BillingError(
        `Payment of ${formatMoney(input.amount, invoice.currency)} exceeds the outstanding balance of ${formatMoney(outstanding, invoice.currency)}.`,
      );
    }

    const receiptCount = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(payments)
      .where(eq(payments.invoiceId, invoice.id));
    const receiptNumber = `RCPT-${invoice.invoiceNumber}-${(receiptCount[0]?.count ?? 0) + 1}`;

    const now = new Date();
    const [payment] = await tx
      .insert(payments)
      .values({
        invoiceId: invoice.id,
        appointmentId: invoice.appointmentId,
        patientId: invoice.patientId,
        amount: input.amount,
        currency: invoice.currency,
        status: "PAID",
        paymentMethod: input.method,
        receiptNumber,
        idempotencyKey: input.idempotencyKey,
        recordedByUserId: input.actorUserId,
        paidAt: now,
      })
      .returning();
    if (!payment) throw new BillingError("Failed to record the payment.");

    const newAmountPaid = addMoney(invoice.amountPaid, input.amount);
    const isFullyPaid = compareMoney(newAmountPaid, invoice.total) >= 0;
    const newStatus = isFullyPaid ? "PAID" : "PARTIALLY_PAID";

    const updated = await tx
      .update(invoices)
      .set({
        amountPaid: newAmountPaid,
        status: newStatus,
        paidAt: isFullyPaid ? now : invoice.paidAt,
        updatedAt: now,
      })
      .where(and(eq(invoices.id, invoice.id), eq(invoices.amountPaid, invoice.amountPaid)))
      .returning();
    if (updated.length === 0) {
      // Should be impossible under the FOR UPDATE lock; fail loudly rather than silently drift.
      throw new BillingError("Concurrent update detected while recording payment. Please retry.");
    }

    await tx
      .update(appointments)
      .set({ paymentStatus: isFullyPaid ? "PAID" : "PENDING" })
      .where(eq(appointments.id, invoice.appointmentId));

    return { invoice: updated[0]!, payment, alreadyRecorded: false };
  });

  if (!result.alreadyRecorded) {
    await recordAuthAuditEvent({
      actorUserId: input.actorUserId,
      action: "PAYMENT_RECORDED",
      entityType: "payment",
      entityId: result.payment.id,
      metadata: {
        invoiceId: result.invoice.id,
        amount: result.payment.amount,
        currency: result.payment.currency,
      },
    }).catch((error) => console.error("[billing] audit log failed:", error));

    await createNotification({
      userId: result.invoice.patientId,
      type: "PAYMENT_RECORDED",
      title: "Payment recorded",
      message: `Payment of ${formatMoney(result.payment.amount, result.payment.currency)} was recorded for invoice ${result.invoice.invoiceNumber}.`,
      metadata: { invoiceId: result.invoice.id, paymentId: result.payment.id },
    }).catch((error) => console.error("[billing] notification failed:", error));
  }

  return result;
}

interface RecordRefundInput {
  actorUserId: string;
  hospitalIds: string[] | null;
  paymentId: string;
  amount: string;
  reason: string;
}

/**
 * Records that money was handed back to the patient OUTSIDE this system
 * (Phase 12 has no gateway to reverse a real charge through). Never deletes
 * or mutates the original payment row — refunds are additive history
 * (spec §20/§50).
 *
 * Concurrency (spec §21/§22): the INVOICE row is locked with
 * `SELECT ... FOR UPDATE` before any refund math happens. Because every
 * payment AND every refund against an invoice takes this same lock first,
 * two simultaneous refund attempts — even against the same payment — are
 * fully serialized, so `amountRefunded` can never exceed `amountPaid`.
 */
export async function recordRefund(
  input: RecordRefundInput,
): Promise<{ invoice: Invoice; refund: Refund }> {
  if (!isPositiveAmount(input.amount)) {
    throw new BillingError("Refund amount must be a positive number.");
  }
  if (!input.reason.trim()) {
    throw new BillingError("A refund reason is required.");
  }

  const result = await db.transaction(async (tx) => {
    const payment = await tx.query.payments.findFirst({ where: eq(payments.id, input.paymentId) });
    if (!payment) throw new BillingError("Payment not found.");

    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.id, payment.invoiceId))
      .for("update");
    if (!invoice) throw new BillingError("Invoice not found.");

    assertHospitalAuthorized(invoice, input.hospitalIds);

    if (payment.status === "FAILED" || payment.status === "CANCELLED") {
      throw new BillingError("This payment was never completed and cannot be refunded.");
    }

    // Per-payment refundable amount (defense in depth beyond the invoice-level check below).
    const priorRefundsForPayment = await tx
      .select({ total: sql<string>`coalesce(sum(${refunds.amount}), '0.00')` })
      .from(refunds)
      .where(eq(refunds.paymentId, payment.id));
    const paymentRefundable = subtractMoney(
      payment.amount,
      priorRefundsForPayment[0]?.total ?? "0.00",
    );
    if (compareMoney(input.amount, paymentRefundable) > 0) {
      throw new BillingError(
        `Refund of ${formatMoney(input.amount, invoice.currency)} exceeds this payment's refundable balance of ${formatMoney(paymentRefundable, invoice.currency)}.`,
      );
    }

    // Invoice-level refundable amount — the authoritative, non-negotiable rule: amountRefunded must never exceed amountPaid.
    const invoiceRefundable = subtractMoney(invoice.amountPaid, invoice.amountRefunded);
    if (compareMoney(input.amount, invoiceRefundable) > 0) {
      throw new BillingError(
        `Refund of ${formatMoney(input.amount, invoice.currency)} exceeds the invoice's refundable balance of ${formatMoney(invoiceRefundable, invoice.currency)}.`,
      );
    }

    const now = new Date();
    const [refund] = await tx
      .insert(refunds)
      .values({
        paymentId: payment.id,
        invoiceId: invoice.id,
        amount: input.amount,
        reason: input.reason.trim(),
        status: "COMPLETED",
        method: payment.paymentMethod,
        processedByUserId: input.actorUserId,
        completedAt: now,
      })
      .returning();
    if (!refund) throw new BillingError("Failed to record the refund.");

    const newAmountRefunded = addMoney(invoice.amountRefunded, input.amount);
    const isFullyRefunded = compareMoney(newAmountRefunded, invoice.amountPaid) >= 0;
    const newInvoiceStatus = isFullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED";

    const updatedInvoice = await tx
      .update(invoices)
      .set({ amountRefunded: newAmountRefunded, status: newInvoiceStatus, updatedAt: now })
      .where(and(eq(invoices.id, invoice.id), eq(invoices.amountRefunded, invoice.amountRefunded)))
      .returning();
    if (updatedInvoice.length === 0) {
      throw new BillingError("Concurrent update detected while recording refund. Please retry.");
    }

    const newPaymentRefundedTotal = addMoney(
      priorRefundsForPayment[0]?.total ?? "0.00",
      input.amount,
    );
    const isPaymentFullyRefunded = compareMoney(newPaymentRefundedTotal, payment.amount) >= 0;
    await tx
      .update(payments)
      .set({ status: isPaymentFullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED", updatedAt: now })
      .where(eq(payments.id, payment.id));

    await tx
      .update(appointments)
      .set({ paymentStatus: isFullyRefunded ? "REFUNDED" : "PAID" })
      .where(eq(appointments.id, invoice.appointmentId));

    return { invoice: updatedInvoice[0]!, refund };
  });

  await recordAuthAuditEvent({
    actorUserId: input.actorUserId,
    action: "REFUND_RECORDED",
    entityType: "refund",
    entityId: result.refund.id,
    metadata: {
      invoiceId: result.invoice.id,
      paymentId: result.refund.paymentId,
      amount: result.refund.amount,
      currency: result.invoice.currency,
    },
  }).catch((error) => console.error("[billing] audit log failed:", error));

  await createNotification({
    userId: result.invoice.patientId,
    type: "REFUND_RECORDED",
    title: "Refund recorded",
    message: `A refund of ${formatMoney(result.refund.amount, result.invoice.currency)} was recorded for invoice ${result.invoice.invoiceNumber}.`,
    metadata: { invoiceId: result.invoice.id, refundId: result.refund.id },
  }).catch((error) => console.error("[billing] notification failed:", error));

  return result;
}

/**
 * `hospitalIds === null` means the actor is a Platform Admin, who may act
 * ONLY on invoices with no hospital (spec §15 — "determine an appropriate
 * safe workflow" for hospital-less invoices was left open; this is the
 * documented Phase 12 choice: nobody but Platform Admin oversees those).
 * A Hospital Admin's `hospitalIds` never includes `null`, so a hospital-less
 * invoice is correctly unreachable to them too.
 */
function assertHospitalAuthorized(invoice: Invoice, hospitalIds: string[] | null): void {
  if (hospitalIds === null) {
    if (invoice.hospitalId !== null) {
      throw new BillingError("Invoice not found.");
    }
    return;
  }
  if (invoice.hospitalId === null || !hospitalIds.includes(invoice.hospitalId)) {
    throw new BillingError("Invoice not found.");
  }
}

export { assertHospitalAuthorized };
