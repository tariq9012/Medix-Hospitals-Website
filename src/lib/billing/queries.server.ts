import "@tanstack/react-start/server-only";

import { and, count, desc, eq, ilike, or, sql, type AnyColumn, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { doctors, hospitals, invoices, patientProfiles, payments, refunds } from "@/db/schema";

function paginate<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

const INVOICE_STATUS_VALUES = [
  "DRAFT",
  "ISSUED",
  "PARTIALLY_PAID",
  "PAID",
  "VOID",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
] as const;
export type InvoiceStatusFilter = (typeof INVOICE_STATUS_VALUES)[number];

export interface InvoiceListFilters {
  status?: InvoiceStatusFilter;
  search?: string;
  page: number;
  pageSize: number;
}

const invoiceListColumns = {
  id: invoices.id,
  invoiceNumber: invoices.invoiceNumber,
  currency: invoices.currency,
  total: invoices.total,
  amountPaid: invoices.amountPaid,
  amountRefunded: invoices.amountRefunded,
  status: invoices.status,
  issuedAt: invoices.issuedAt,
  patientId: invoices.patientId,
  hospitalId: invoices.hospitalId,
  patientFirstName: patientProfiles.firstName,
  patientLastName: patientProfiles.lastName,
  doctorFirstName: doctors.firstName,
  doctorLastName: doctors.lastName,
  hospitalName: hospitals.name,
} as const;

function invoiceBaseQuery() {
  return db
    .select(invoiceListColumns)
    .from(invoices)
    .innerJoin(doctors, eq(doctors.id, invoices.doctorId))
    .leftJoin(patientProfiles, eq(patientProfiles.userId, invoices.patientId))
    .leftJoin(hospitals, eq(hospitals.id, invoices.hospitalId));
}

/** Patient's own invoices only — ownership is baked into the WHERE clause, never trusted from the client. */
export async function listPatientInvoices(patientId: string, filters: InvoiceListFilters) {
  const conditions: SQL[] = [eq(invoices.patientId, patientId)];
  if (filters.status) conditions.push(eq(invoices.status, filters.status));
  const where = and(...conditions);

  const [rows, [totalRow]] = await Promise.all([
    invoiceBaseQuery()
      .where(where)
      .orderBy(desc(invoices.issuedAt))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    db.select({ value: count() }).from(invoices).where(where),
  ]);
  return paginate(rows, totalRow?.value ?? 0, filters.page, filters.pageSize);
}

/**
 * A single invoice, but only if it belongs to this patient — another
 * patient's invoice is indistinguishable from a nonexistent one (spec §41).
 */
export async function getPatientInvoice(patientId: string, invoiceId: string) {
  const [row] = await invoiceBaseQuery()
    .where(and(eq(invoices.id, invoiceId), eq(invoices.patientId, patientId)))
    .limit(1);
  return row ?? null;
}

/** Hospital-scoped invoices only — `hospitalIds` always comes from `requireHospitalAdmin()`, never a client-supplied id (spec §16/§42). */
export async function listHospitalInvoices(hospitalIds: string[], filters: InvoiceListFilters) {
  const conditions: SQL[] = [or(...hospitalIds.map((id) => eq(invoices.hospitalId, id)))!];
  if (filters.status) conditions.push(eq(invoices.status, filters.status));
  if (filters.search) {
    const term = `%${filters.search}%`;
    const searchCondition = or(
      ilike(invoices.invoiceNumber, term),
      ilike(patientProfiles.firstName, term),
      ilike(patientProfiles.lastName, term),
    );
    if (searchCondition) conditions.push(searchCondition);
  }
  const where = and(...conditions);

  const [rows, [totalRow]] = await Promise.all([
    invoiceBaseQuery()
      .where(where)
      .orderBy(desc(invoices.issuedAt))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    db
      .select({ value: count() })
      .from(invoices)
      .leftJoin(patientProfiles, eq(patientProfiles.userId, invoices.patientId))
      .where(where),
  ]);
  return paginate(rows, totalRow?.value ?? 0, filters.page, filters.pageSize);
}

export async function getHospitalInvoice(hospitalIds: string[], invoiceId: string) {
  const [row] = await invoiceBaseQuery()
    .where(
      and(eq(invoices.id, invoiceId), or(...hospitalIds.map((id) => eq(invoices.hospitalId, id)))),
    )
    .limit(1);
  return row ?? null;
}

/** Platform Admin oversight: read-only, no clinical joins beyond names needed to identify the invoice (spec §29/§44). */
export async function listAllInvoices(filters: InvoiceListFilters) {
  const conditions: SQL[] = [];
  if (filters.status) conditions.push(eq(invoices.status, filters.status));
  if (filters.search) {
    const term = `%${filters.search}%`;
    const searchCondition = or(
      ilike(invoices.invoiceNumber, term),
      ilike(patientProfiles.firstName, term),
      ilike(patientProfiles.lastName, term),
    );
    if (searchCondition) conditions.push(searchCondition);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [totalRow]] = await Promise.all([
    invoiceBaseQuery()
      .where(where)
      .orderBy(desc(invoices.issuedAt))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    db.select({ value: count() }).from(invoices).where(where),
  ]);
  return paginate(rows, totalRow?.value ?? 0, filters.page, filters.pageSize);
}

export async function getAnyInvoice(invoiceId: string) {
  const [row] = await invoiceBaseQuery().where(eq(invoices.id, invoiceId)).limit(1);
  return row ?? null;
}

export interface AdminFinancialTotals {
  invoiceCount: number;
  totalInvoiced: string;
  totalCollected: string;
  totalRefunded: string;
  byStatus: Record<string, number>;
}

/** Aggregate, read-only figures for the admin oversight dashboard — no per-patient clinical detail. */
export async function getAdminFinancialTotals(): Promise<AdminFinancialTotals> {
  const [totals] = await db
    .select({
      invoiceCount: count(),
      totalInvoiced: sqlSum(invoices.total),
      totalCollected: sqlSum(invoices.amountPaid),
      totalRefunded: sqlSum(invoices.amountRefunded),
    })
    .from(invoices);

  const statusRows = await db
    .select({ status: invoices.status, value: count() })
    .from(invoices)
    .groupBy(invoices.status);

  return {
    invoiceCount: totals?.invoiceCount ?? 0,
    totalInvoiced: totals?.totalInvoiced ?? "0.00",
    totalCollected: totals?.totalCollected ?? "0.00",
    totalRefunded: totals?.totalRefunded ?? "0.00",
    byStatus: Object.fromEntries(statusRows.map((r) => [r.status, r.value])),
  };
}

/** Decimal-safe SUM() as text (never a JS float) via drizzle's sql template. */
function sqlSum(column: AnyColumn) {
  return sql<string>`coalesce(sum(${column}), '0.00')`;
}

export interface PaymentListFilters {
  page: number;
  pageSize: number;
}

/** Payments for one invoice, newest first — used by every role's invoice detail view. Caller must already have authorized access to the invoice itself. */
export async function listPaymentsForInvoice(invoiceId: string) {
  return db
    .select()
    .from(payments)
    .where(eq(payments.invoiceId, invoiceId))
    .orderBy(desc(payments.createdAt));
}

export async function listRefundsForInvoice(invoiceId: string) {
  return db
    .select()
    .from(refunds)
    .where(eq(refunds.invoiceId, invoiceId))
    .orderBy(desc(refunds.createdAt));
}

/**
 * Doctor's own read-only financial visibility (spec §30): invoice status per
 * appointment, never amounts collected globally or anything resembling
 * payouts. `doctorId` always comes from `requireDoctorRecord()`.
 */
export async function listDoctorInvoiceStatuses(
  doctorId: string,
  filters: { page: number; pageSize: number },
) {
  const where = eq(invoices.doctorId, doctorId);
  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        status: invoices.status,
        total: invoices.total,
        currency: invoices.currency,
        issuedAt: invoices.issuedAt,
        patientFirstName: patientProfiles.firstName,
        patientLastName: patientProfiles.lastName,
      })
      .from(invoices)
      .leftJoin(patientProfiles, eq(patientProfiles.userId, invoices.patientId))
      .where(where)
      .orderBy(desc(invoices.issuedAt))
      .limit(filters.pageSize)
      .offset((filters.page - 1) * filters.pageSize),
    db.select({ value: count() }).from(invoices).where(where),
  ]);
  return paginate(rows, totalRow?.value ?? 0, filters.page, filters.pageSize);
}
