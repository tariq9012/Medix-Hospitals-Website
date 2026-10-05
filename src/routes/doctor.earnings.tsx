import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { InvoiceStatusBadge } from "@/components/billing/InvoiceStatusBadge";
import { Money } from "@/components/billing/Money";
import { Column, DataTable } from "@/components/common/DataTable";
import { PageHeader } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";
import { listDoctorInvoiceStatusesFn } from "@/lib/billing/functions";

export const Route = createFileRoute("/doctor/earnings")({
  beforeLoad: requireRoleBeforeLoad("DOCTOR"),
  head: () => ({
    meta: [
      { title: "Payment status — Medix" },
      { name: "description", content: "Payment status for your appointments." },
    ],
  }),
  component: DoctorFinancialView,
});

type Row = Awaited<ReturnType<typeof listDoctorInvoiceStatusesFn>>["items"][number];

function DoctorFinancialView() {
  const { user } = Route.useRouteContext();
  const [rows, setRows] = useState<Row[] | null>(null);

  const load = useCallback(() => {
    listDoctorInvoiceStatusesFn({ data: { page: 1, pageSize: 50 } })
      .then((page) => setRows(page.items))
      .catch(() => setRows([]));
  }, []);

  useEffect(load, [load]);

  const columns: Column<Row>[] = [
    { key: "invoiceNumber", header: "Invoice", render: (r) => r.invoiceNumber },
    {
      key: "patient",
      header: "Patient",
      render: (r) => `${r.patientFirstName ?? ""} ${r.patientLastName ?? ""}`.trim() || "—",
    },
    {
      key: "issuedAt",
      header: "Date",
      render: (r) => new Date(r.issuedAt).toLocaleDateString(),
    },
    {
      key: "total",
      header: "Fee",
      render: (r) => <Money amount={r.total} currency={r.currency} />,
    },
    {
      key: "status",
      header: "Payment status",
      render: (r) => <InvoiceStatusBadge status={r.status} />,
    },
  ];

  return (
    <DashboardLayout role="doctor" user={{ name: user.displayName, subtitle: "Doctor account" }}>
      <PageHeader
        title="Payment status"
        description="Read-only view of whether your confirmed appointments have been paid. This does not represent payouts to you — Medix does not yet process doctor payouts."
      />
      {rows === null ? (
        <p className="py-10 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          emptyTitle="No invoices yet"
          emptyDescription="An invoice appears here once you confirm an appointment."
        />
      )}
    </DashboardLayout>
  );
}
