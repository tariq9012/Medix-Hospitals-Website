import { createFileRoute, Link } from "@tanstack/react-router";
import { Receipt } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Column, DataTable } from "@/components/common/DataTable";
import { InvoiceStatusBadge } from "@/components/billing/InvoiceStatusBadge";
import { Money } from "@/components/billing/Money";
import { PageHeader } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";
import { listPatientInvoicesFn } from "@/lib/billing/functions";
import { addMoney, subtractMoney } from "@/lib/billing/money";
import { useRealtimeRevalidate } from "@/lib/realtime/client";

export const Route = createFileRoute("/patient/payments/")({
  beforeLoad: requireRoleBeforeLoad("PATIENT"),
  head: () => ({
    meta: [
      { title: "Billing — Medix" },
      { name: "description", content: "Your invoices, payments and receipts." },
    ],
  }),
  component: PatientBilling,
});

type Row = Awaited<ReturnType<typeof listPatientInvoicesFn>>["items"][number];

function PatientBilling() {
  const { user } = Route.useRouteContext();
  const [rows, setRows] = useState<Row[] | null>(null);

  const load = useCallback(() => {
    listPatientInvoicesFn({ data: { page: 1, pageSize: 50 } })
      .then((page) => setRows(page.items))
      .catch(() => setRows([]));
  }, []);

  useEffect(load, [load]);
  useRealtimeRevalidate(["NOTIFICATION_CREATED"], load);

  const columns: Column<Row>[] = [
    { key: "invoiceNumber", header: "Invoice", render: (r) => r.invoiceNumber },
    {
      key: "doctor",
      header: "Doctor",
      render: (r) => `Dr. ${r.doctorFirstName} ${r.doctorLastName}`,
    },
    {
      key: "issuedAt",
      header: "Issued",
      render: (r) => new Date(r.issuedAt).toLocaleDateString(),
    },
    {
      key: "total",
      header: "Total",
      render: (r) => <Money amount={r.total} currency={r.currency} />,
    },
    {
      key: "outstanding",
      header: "Outstanding",
      render: (r) => (
        <Money
          amount={addMoney(subtractMoney(r.total, r.amountPaid), r.amountRefunded)}
          currency={r.currency}
        />
      ),
    },
    { key: "status", header: "Status", render: (r) => <InvoiceStatusBadge status={r.status} /> },
    {
      key: "action",
      header: "",
      render: (r) => (
        <Button asChild size="sm" variant="outline">
          <Link to="/patient/payments/$id" params={{ id: r.id }}>
            View
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <DashboardLayout role="patient" user={{ name: user.displayName, subtitle: "Patient account" }}>
      <PageHeader
        title="Billing"
        description="Invoices for your appointments, payment status and receipts."
      />
      {rows === null ? (
        <p className="py-10 text-sm text-muted-foreground">Loading your invoices…</p>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          emptyTitle="No invoices yet"
          emptyDescription="An invoice appears here once a doctor confirms your appointment."
        />
      )}
    </DashboardLayout>
  );
}
