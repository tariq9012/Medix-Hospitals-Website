import { createServerFn } from "@tanstack/react-start";
import { isRedirect } from "@tanstack/react-router";
import { z } from "zod";

import { requireAdmin, requireRole } from "@/lib/auth/authorization.server";
import { requireDoctorRecord } from "@/lib/doctor/queries.server";
import { resolveHospitalContext } from "@/lib/hospital/queries.server";
import { idSchema } from "@/lib/validation/common";
import {
  invoiceListFiltersSchema,
  recordPaymentSchema,
  recordRefundSchema,
} from "@/lib/validation/billing";

import { BillingError } from "./errors";
import {
  getAdminFinancialTotals,
  getAnyInvoice,
  getHospitalInvoice,
  getPatientInvoice,
  listAllInvoices,
  listDoctorInvoiceStatuses,
  listHospitalInvoices,
  listPatientInvoices,
  listPaymentsForInvoice,
  listRefundsForInvoice,
} from "./queries.server";
import { recordPayment, recordRefund } from "./service.server";

type ActionError = { message: string };
type ActionResult<T> = ({ ok: true } & T) | ({ ok: false } & ActionError);

function toActionError(error: unknown): ActionError {
  // Authorization failures are signalled by a thrown redirect and must
  // reach the router rather than becoming a generic message.
  if (isRedirect(error)) throw error;
  if (error instanceof BillingError) return { message: error.message };
  console.error("[billing] unexpected error:", error);
  return { message: "Something went wrong. Please try again." };
}

// --- Patient ----------------------------------------------------------------------

export const listPatientInvoicesFn = createServerFn({ method: "GET" })
  .validator(invoiceListFiltersSchema)
  .handler(async ({ data }) => {
    const user = await requireRole("PATIENT");
    return listPatientInvoices(user.id, data);
  });

export const getPatientInvoiceFn = createServerFn({ method: "GET" })
  .validator(z.object({ invoiceId: idSchema }))
  .handler(async ({ data }) => {
    const user = await requireRole("PATIENT");
    const invoice = await getPatientInvoice(user.id, data.invoiceId);
    if (!invoice) return null;
    const [payments, refunds] = await Promise.all([
      listPaymentsForInvoice(invoice.id),
      listRefundsForInvoice(invoice.id),
    ]);
    return { invoice, payments, refunds };
  });

// --- Hospital Admin -----------------------------------------------------------------

export const listHospitalInvoicesFn = createServerFn({ method: "GET" })
  .validator(invoiceListFiltersSchema)
  .handler(async ({ data }) => {
    const ctx = await resolveHospitalContext();
    return listHospitalInvoices([ctx.hospital.id], data);
  });

export const getHospitalInvoiceFn = createServerFn({ method: "GET" })
  .validator(z.object({ invoiceId: idSchema }))
  .handler(async ({ data }) => {
    const ctx = await resolveHospitalContext();
    const invoice = await getHospitalInvoice([ctx.hospital.id], data.invoiceId);
    if (!invoice) return null;
    const [payments, refunds] = await Promise.all([
      listPaymentsForInvoice(invoice.id),
      listRefundsForInvoice(invoice.id),
    ]);
    return { invoice, payments, refunds };
  });

export const recordHospitalPaymentFn = createServerFn({ method: "POST" })
  .validator(recordPaymentSchema)
  .handler(async ({ data }): Promise<ActionResult<{ paymentId: string }>> => {
    try {
      const ctx = await resolveHospitalContext();
      const result = await recordPayment({
        actorUserId: ctx.user.id,
        hospitalIds: [ctx.hospital.id],
        invoiceId: data.invoiceId,
        amount: data.amount,
        method: data.method,
        idempotencyKey: data.idempotencyKey,
      });
      return { ok: true, paymentId: result.payment.id };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

export const recordHospitalRefundFn = createServerFn({ method: "POST" })
  .validator(recordRefundSchema)
  .handler(async ({ data }): Promise<ActionResult<{ refundId: string }>> => {
    try {
      const ctx = await resolveHospitalContext();
      const result = await recordRefund({
        actorUserId: ctx.user.id,
        hospitalIds: [ctx.hospital.id],
        paymentId: data.paymentId,
        amount: data.amount,
        reason: data.reason,
      });
      return { ok: true, refundId: result.refund.id };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

// --- Platform Admin -------------------------------------------------------------------
// Read-only oversight, EXCEPT for hospital-less invoices (no hospital to own
// them — spec §15's "determine an appropriate safe workflow"), where the
// Platform Admin is the only role that may record payment/refund.

export const listAllInvoicesFn = createServerFn({ method: "GET" })
  .validator(invoiceListFiltersSchema)
  .handler(async ({ data }) => {
    await requireAdmin();
    return listAllInvoices(data);
  });

export const getAdminFinancialTotalsFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  return getAdminFinancialTotals();
});

export const getAdminInvoiceFn = createServerFn({ method: "GET" })
  .validator(z.object({ invoiceId: idSchema }))
  .handler(async ({ data }) => {
    await requireAdmin();
    const invoice = await getAnyInvoice(data.invoiceId);
    if (!invoice) return null;
    const [payments, refunds] = await Promise.all([
      listPaymentsForInvoice(invoice.id),
      listRefundsForInvoice(invoice.id),
    ]);
    return { invoice, payments, refunds };
  });

export const recordAdminPaymentFn = createServerFn({ method: "POST" })
  .validator(recordPaymentSchema)
  .handler(async ({ data }): Promise<ActionResult<{ paymentId: string }>> => {
    try {
      const admin = await requireAdmin();
      const result = await recordPayment({
        actorUserId: admin.id,
        hospitalIds: null,
        invoiceId: data.invoiceId,
        amount: data.amount,
        method: data.method,
        idempotencyKey: data.idempotencyKey,
      });
      return { ok: true, paymentId: result.payment.id };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

export const recordAdminRefundFn = createServerFn({ method: "POST" })
  .validator(recordRefundSchema)
  .handler(async ({ data }): Promise<ActionResult<{ refundId: string }>> => {
    try {
      const admin = await requireAdmin();
      const result = await recordRefund({
        actorUserId: admin.id,
        hospitalIds: null,
        paymentId: data.paymentId,
        amount: data.amount,
        reason: data.reason,
      });
      return { ok: true, refundId: result.refund.id };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

// --- Doctor (read-only financial visibility) -------------------------------------------

export const listDoctorInvoiceStatusesFn = createServerFn({ method: "GET" })
  .validator(
    z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(50).default(20),
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctorRecord();
    return listDoctorInvoiceStatuses(doctor.id, data);
  });
