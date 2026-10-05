import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { eq } from "drizzle-orm";

import { db } from "../../src/db";
import { appointments, doctors, invoices } from "../../src/db/schema";
import { BillingError } from "../../src/lib/billing/errors";
import { compareMoney } from "../../src/lib/billing/money";
import {
  createInvoiceForAppointment,
  recordPayment,
  recordRefund,
  voidInvoiceForCancelledAppointment,
} from "../../src/lib/billing/service.server";

import { makeConfirmedAppointment, setup } from "./fixtures";

let fixtures: Awaited<ReturnType<typeof setup>>;

before(async () => {
  fixtures = await setup();
});

after(async () => {
  const { client } = await import("../../src/db");
  await client.end();
});

describe("Fee snapshot (spec §47)", () => {
  it("an existing invoice keeps the fee the appointment was booked at, even after the doctor's current fee changes", async () => {
    const { appointment } = await makeConfirmedAppointment({
      patientEmail: "fee.snapshot.patient@example.com",
      doctorId: fixtures.doctor.id,
      hospitalId: fixtures.hospitalA.id,
      fee: "3000.00",
      reason: "fee-snapshot-test",
    });
    const invoice = await db.transaction((tx) => createInvoiceForAppointment(tx, appointment));
    assert.equal(invoice.total, "3000.00");

    // Doctor's fee changes AFTER the invoice already exists.
    await db
      .update(doctors)
      .set({ consultationFee: "5000.00" })
      .where(eq(doctors.id, fixtures.doctor.id));

    const [reloaded] = await db.select().from(invoices).where(eq(invoices.id, invoice.id));
    assert.equal(
      reloaded!.total,
      "3000.00",
      "existing invoice must not be recalculated from the doctor's new fee",
    );

    // A NEW appointment booked after the fee change gets the new fee.
    const { appointment: newAppt } = await makeConfirmedAppointment({
      patientEmail: "fee.snapshot.patient2@example.com",
      doctorId: fixtures.doctor.id,
      hospitalId: fixtures.hospitalA.id,
      fee: "5000.00",
      reason: "fee-snapshot-test-2",
    });
    const newInvoice = await db.transaction((tx) => createInvoiceForAppointment(tx, newAppt));
    assert.equal(newInvoice.total, "5000.00");

    await db
      .update(doctors)
      .set({ consultationFee: "3000.00" })
      .where(eq(doctors.id, fixtures.doctor.id));
  });
});

describe("One invoice per appointment (spec §9)", () => {
  it("creating an invoice twice for the same appointment returns the SAME invoice, not a duplicate", async () => {
    const { appointment } = await makeConfirmedAppointment({
      patientEmail: "one.invoice.patient@example.com",
      doctorId: fixtures.doctor.id,
      hospitalId: fixtures.hospitalA.id,
      fee: "1000.00",
      reason: "one-invoice-test",
    });
    const first = await db.transaction((tx) => createInvoiceForAppointment(tx, appointment));
    const second = await db.transaction((tx) => createInvoiceForAppointment(tx, appointment));
    assert.equal(first.id, second.id);

    const rows = await db.select().from(invoices).where(eq(invoices.appointmentId, appointment.id));
    assert.equal(rows.length, 1);
  });

  it("rejects an appointment with no fee snapshot", async () => {
    const { appointment } = await makeConfirmedAppointment({
      patientEmail: "no.fee.patient@example.com",
      doctorId: fixtures.doctor.id,
      hospitalId: fixtures.hospitalA.id,
      fee: "1000.00",
      reason: "no-fee-test",
    });
    await assert.rejects(
      () => db.transaction((tx) => createInvoiceForAppointment(tx, { ...appointment, fee: null })),
      BillingError,
    );
  });
});

describe("Authorization (spec §16/§42/§48)", () => {
  it("Hospital B cannot record a payment against Hospital A's invoice", async () => {
    const { appointment } = await makeConfirmedAppointment({
      patientEmail: "cross.hospital.patient@example.com",
      doctorId: fixtures.doctor.id,
      hospitalId: fixtures.hospitalA.id,
      fee: "2000.00",
      reason: "cross-hospital-test",
    });
    const invoice = await db.transaction((tx) => createInvoiceForAppointment(tx, appointment));

    await assert.rejects(
      () =>
        recordPayment({
          actorUserId: fixtures.hospitalAdminB.id,
          hospitalIds: [fixtures.hospitalB.id],
          invoiceId: invoice.id,
          amount: "2000.00",
          method: "CASH",
        }),
      (error: unknown) => error instanceof BillingError && /not found/i.test(error.message),
    );

    const [reloaded] = await db.select().from(invoices).where(eq(invoices.id, invoice.id));
    assert.equal(
      reloaded!.amountPaid,
      "0.00",
      "the unauthorized attempt must not have changed anything",
    );
  });

  it("a Platform Admin cannot act on an invoice that DOES belong to a hospital", async () => {
    const { appointment } = await makeConfirmedAppointment({
      patientEmail: "admin.scope.patient@example.com",
      doctorId: fixtures.doctor.id,
      hospitalId: fixtures.hospitalA.id,
      fee: "1500.00",
      reason: "admin-scope-test",
    });
    const invoice = await db.transaction((tx) => createInvoiceForAppointment(tx, appointment));
    await assert.rejects(
      () =>
        recordPayment({
          actorUserId: "00000000-0000-0000-0000-000000000000",
          hospitalIds: null, // Platform Admin
          invoiceId: invoice.id,
          amount: "1500.00",
          method: "CASH",
        }),
      BillingError,
    );
  });
});

describe("Overpayment prevention (spec §13/§41)", () => {
  it("rejects a payment larger than the outstanding balance", async () => {
    const { appointment } = await makeConfirmedAppointment({
      patientEmail: "overpay.patient@example.com",
      doctorId: fixtures.doctor.id,
      hospitalId: fixtures.hospitalA.id,
      fee: "1000.00",
      reason: "overpay-test",
    });
    const invoice = await db.transaction((tx) => createInvoiceForAppointment(tx, appointment));
    await assert.rejects(
      () =>
        recordPayment({
          actorUserId: fixtures.hospitalAdminA.id,
          hospitalIds: [fixtures.hospitalA.id],
          invoiceId: invoice.id,
          amount: "1000.01",
          method: "CASH",
        }),
      (error: unknown) => error instanceof BillingError && /exceeds/i.test(error.message),
    );
  });

  it("the patient role has no server function capable of marking an invoice paid", async () => {
    // Structural guarantee: only Hospital-Admin- and Admin-authorized
    // functions can call recordPayment/recordRefund at all (see functions.ts
    // — every mutating export requires resolveHospitalContext() or
    // requireAdmin()). There is no patient-facing equivalent to inspect.
    const mod = await import("../../src/lib/billing/functions");
    const patientLike = Object.keys(mod).filter(
      (k) => /record/i.test(k) && !/hospital|admin/i.test(k),
    );
    assert.deepEqual(patientLike, []);
  });
});

describe("Partial + full payment lifecycle (spec §19)", () => {
  it("ISSUED -> PARTIALLY_PAID -> PAID, with correct amounts at each step", async () => {
    const { appointment } = await makeConfirmedAppointment({
      patientEmail: "partial.patient@example.com",
      doctorId: fixtures.doctor.id,
      hospitalId: fixtures.hospitalA.id,
      fee: "3500.00",
      reason: "partial-payment-test",
    });
    const invoice = await db.transaction((tx) => createInvoiceForAppointment(tx, appointment));
    assert.equal(invoice.status, "ISSUED");

    const r1 = await recordPayment({
      actorUserId: fixtures.hospitalAdminA.id,
      hospitalIds: [fixtures.hospitalA.id],
      invoiceId: invoice.id,
      amount: "2000.00",
      method: "CASH",
    });
    assert.equal(r1.invoice.status, "PARTIALLY_PAID");
    assert.equal(r1.invoice.amountPaid, "2000.00");

    const r2 = await recordPayment({
      actorUserId: fixtures.hospitalAdminA.id,
      hospitalIds: [fixtures.hospitalA.id],
      invoiceId: invoice.id,
      amount: "1500.00",
      method: "CASH",
    });
    assert.equal(r2.invoice.status, "PAID");
    assert.equal(r2.invoice.amountPaid, "3500.00");
    assert.ok(r2.invoice.paidAt);

    const appt = await db.select().from(appointments).where(eq(appointments.id, appointment.id));
    assert.equal(appt[0]!.paymentStatus, "PAID");
  });
});

describe("Idempotency (spec §35)", () => {
  it("a repeated record-payment call with the same idempotency key does not double-charge", async () => {
    const { appointment } = await makeConfirmedAppointment({
      patientEmail: "idempotent.patient@example.com",
      doctorId: fixtures.doctor.id,
      hospitalId: fixtures.hospitalA.id,
      fee: "1200.00",
      reason: "idempotency-test",
    });
    const invoice = await db.transaction((tx) => createInvoiceForAppointment(tx, appointment));
    const key = crypto.randomUUID();

    const first = await recordPayment({
      actorUserId: fixtures.hospitalAdminA.id,
      hospitalIds: [fixtures.hospitalA.id],
      invoiceId: invoice.id,
      amount: "1200.00",
      method: "CASH",
      idempotencyKey: key,
    });
    const second = await recordPayment({
      actorUserId: fixtures.hospitalAdminA.id,
      hospitalIds: [fixtures.hospitalA.id],
      invoiceId: invoice.id,
      amount: "1200.00",
      method: "CASH",
      idempotencyKey: key,
    });

    assert.equal(first.payment.id, second.payment.id);
    assert.equal(second.alreadyRecorded, true);
    const [reloaded] = await db.select().from(invoices).where(eq(invoices.id, invoice.id));
    assert.equal(reloaded!.amountPaid, "1200.00", "must not have been charged twice");
  });
});

describe("PAYMENT CONCURRENCY (spec §17/§18/§45) — mandatory", () => {
  it("firing two simultaneous full-amount payments: only ONE may complete, amountPaid never exceeds total", async () => {
    const { appointment } = await makeConfirmedAppointment({
      patientEmail: "concurrency.payment.patient@example.com",
      doctorId: fixtures.doctor.id,
      hospitalId: fixtures.hospitalA.id,
      fee: "3500.00",
      reason: "payment-concurrency-test",
    });
    const invoice = await db.transaction((tx) => createInvoiceForAppointment(tx, appointment));

    const attempt = () =>
      recordPayment({
        actorUserId: fixtures.hospitalAdminA.id,
        hospitalIds: [fixtures.hospitalA.id],
        invoiceId: invoice.id,
        amount: "3500.00",
        method: "CASH",
      });

    const results = await Promise.allSettled([attempt(), attempt()]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    assert.equal(fulfilled.length, 1, "exactly one payment must succeed");
    assert.equal(rejected.length, 1, "exactly one payment must be rejected");

    const [reloaded] = await db.select().from(invoices).where(eq(invoices.id, invoice.id));
    assert.equal(reloaded!.amountPaid, "3500.00");
    assert.ok(
      compareMoney(reloaded!.amountPaid, reloaded!.total) <= 0,
      "amountPaid must never exceed total",
    );

    const paymentRows = await db.query.payments.findMany({
      where: (p, { eq }) => eq(p.invoiceId, invoice.id),
    });
    assert.equal(paymentRows.length, 1, "only one payment row must exist");
  });

  it("ten simultaneous partial payments that together would overpay: total collected never exceeds the invoice total", async () => {
    const { appointment } = await makeConfirmedAppointment({
      patientEmail: "concurrency.partial.patient@example.com",
      doctorId: fixtures.doctor.id,
      hospitalId: fixtures.hospitalA.id,
      fee: "1000.00",
      reason: "payment-concurrency-partial-test",
    });
    const invoice = await db.transaction((tx) => createInvoiceForAppointment(tx, appointment));

    // 10 concurrent attempts at 200 each = 2000 total demand against a 1000 invoice.
    const attempts = Array.from({ length: 10 }, () =>
      recordPayment({
        actorUserId: fixtures.hospitalAdminA.id,
        hospitalIds: [fixtures.hospitalA.id],
        invoiceId: invoice.id,
        amount: "200.00",
        method: "CASH",
      }),
    );
    const results = await Promise.allSettled(attempts);
    const fulfilled = results.filter((r) => r.status === "fulfilled").length;
    assert.equal(fulfilled, 5, "exactly 5 of the 10×200 payments should fit inside a 1000 total");

    const [reloaded] = await db.select().from(invoices).where(eq(invoices.id, invoice.id));
    assert.equal(reloaded!.amountPaid, "1000.00");
    assert.equal(reloaded!.status, "PAID");
  });
});

describe("REFUND CONCURRENCY (spec §21/§22/§46) — mandatory", () => {
  it("firing two simultaneous full refund requests: only the valid refundable amount may complete, amountRefunded never exceeds amountPaid", async () => {
    const { appointment } = await makeConfirmedAppointment({
      patientEmail: "concurrency.refund.patient@example.com",
      doctorId: fixtures.doctor.id,
      hospitalId: fixtures.hospitalA.id,
      fee: "3500.00",
      reason: "refund-concurrency-test",
    });
    const invoice = await db.transaction((tx) => createInvoiceForAppointment(tx, appointment));
    const { payment } = await recordPayment({
      actorUserId: fixtures.hospitalAdminA.id,
      hospitalIds: [fixtures.hospitalA.id],
      invoiceId: invoice.id,
      amount: "3500.00",
      method: "CASH",
    });

    const attempt = () =>
      recordRefund({
        actorUserId: fixtures.hospitalAdminA.id,
        hospitalIds: [fixtures.hospitalA.id],
        paymentId: payment.id,
        amount: "3500.00",
        reason: "concurrency test — full refund",
      });

    const results = await Promise.allSettled([attempt(), attempt()]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    assert.equal(fulfilled.length, 1, "exactly one refund must succeed");

    const [reloaded] = await db.select().from(invoices).where(eq(invoices.id, invoice.id));
    assert.equal(reloaded!.amountRefunded, "3500.00");
    assert.ok(
      compareMoney(reloaded!.amountRefunded, reloaded!.amountPaid) <= 0,
      "amountRefunded must never exceed amountPaid",
    );
    assert.equal(reloaded!.status, "REFUNDED");
  });

  it("rejects a refund larger than the payment's own refundable balance", async () => {
    const { appointment } = await makeConfirmedAppointment({
      patientEmail: "overrefund.patient@example.com",
      doctorId: fixtures.doctor.id,
      hospitalId: fixtures.hospitalA.id,
      fee: "1000.00",
      reason: "overrefund-test",
    });
    const invoice = await db.transaction((tx) => createInvoiceForAppointment(tx, appointment));
    const { payment } = await recordPayment({
      actorUserId: fixtures.hospitalAdminA.id,
      hospitalIds: [fixtures.hospitalA.id],
      invoiceId: invoice.id,
      amount: "1000.00",
      method: "CASH",
    });
    await assert.rejects(
      () =>
        recordRefund({
          actorUserId: fixtures.hospitalAdminA.id,
          hospitalIds: [fixtures.hospitalA.id],
          paymentId: payment.id,
          amount: "1000.01",
          reason: "should be rejected",
        }),
      (error: unknown) => error instanceof BillingError && /exceeds/i.test(error.message),
    );
  });

  it("a refund without a reason is rejected", async () => {
    const { appointment } = await makeConfirmedAppointment({
      patientEmail: "noreason.patient@example.com",
      doctorId: fixtures.doctor.id,
      hospitalId: fixtures.hospitalA.id,
      fee: "500.00",
      reason: "no-reason-refund-test",
    });
    const invoice = await db.transaction((tx) => createInvoiceForAppointment(tx, appointment));
    const { payment } = await recordPayment({
      actorUserId: fixtures.hospitalAdminA.id,
      hospitalIds: [fixtures.hospitalA.id],
      invoiceId: invoice.id,
      amount: "500.00",
      method: "CASH",
    });
    await assert.rejects(
      () =>
        recordRefund({
          actorUserId: fixtures.hospitalAdminA.id,
          hospitalIds: [fixtures.hospitalA.id],
          paymentId: payment.id,
          amount: "100.00",
          reason: "   ",
        }),
      BillingError,
    );
  });
});

describe("Cancellation billing policy (spec §23)", () => {
  it("cancelling BEFORE any payment voids the invoice", async () => {
    const { appointment } = await makeConfirmedAppointment({
      patientEmail: "cancel.unpaid.patient@example.com",
      doctorId: fixtures.doctor.id,
      hospitalId: fixtures.hospitalA.id,
      fee: "800.00",
      reason: "cancel-unpaid-test",
    });
    const invoice = await db.transaction((tx) => createInvoiceForAppointment(tx, appointment));
    await db.transaction((tx) => voidInvoiceForCancelledAppointment(tx, appointment.id));
    const [reloaded] = await db.select().from(invoices).where(eq(invoices.id, invoice.id));
    assert.equal(reloaded!.status, "VOID");
  });

  it("cancelling AFTER payment does NOT void or change the paid invoice", async () => {
    const { appointment } = await makeConfirmedAppointment({
      patientEmail: "cancel.paid.patient@example.com",
      doctorId: fixtures.doctor.id,
      hospitalId: fixtures.hospitalA.id,
      fee: "900.00",
      reason: "cancel-paid-test",
    });
    const invoice = await db.transaction((tx) => createInvoiceForAppointment(tx, appointment));
    await recordPayment({
      actorUserId: fixtures.hospitalAdminA.id,
      hospitalIds: [fixtures.hospitalA.id],
      invoiceId: invoice.id,
      amount: "900.00",
      method: "CASH",
    });
    await db.transaction((tx) => voidInvoiceForCancelledAppointment(tx, appointment.id));
    const [reloaded] = await db.select().from(invoices).where(eq(invoices.id, invoice.id));
    assert.equal(reloaded!.status, "PAID", "a paid invoice must never be silently voided");
    assert.equal(reloaded!.amountPaid, "900.00");
  });

  it("cancelling an appointment that was never confirmed (no invoice) is a safe no-op", async () => {
    // never confirmed => never invoiced (invoice creation only happens at CONFIRM)
    await db.transaction((tx) =>
      voidInvoiceForCancelledAppointment(tx, "00000000-0000-0000-0000-000000000000"),
    );
  });
});

describe("Refuses non-positive amounts", () => {
  it("rejects zero and negative payments", async () => {
    const { appointment } = await makeConfirmedAppointment({
      patientEmail: "zero.patient@example.com",
      doctorId: fixtures.doctor.id,
      hospitalId: fixtures.hospitalA.id,
      fee: "500.00",
      reason: "zero-amount-test",
    });
    const invoice = await db.transaction((tx) => createInvoiceForAppointment(tx, appointment));
    for (const amount of ["0.00", "-50.00"]) {
      await assert.rejects(
        () =>
          recordPayment({
            actorUserId: fixtures.hospitalAdminA.id,
            hospitalIds: [fixtures.hospitalA.id],
            invoiceId: invoice.id,
            amount,
            method: "CASH",
          }),
        BillingError,
      );
    }
  });
});
