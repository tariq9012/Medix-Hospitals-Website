import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";

import { InvoiceStatusBadge } from "@/components/billing/InvoiceStatusBadge";
import { Money } from "@/components/billing/Money";
import { Column, DataTable } from "@/components/common/DataTable";
import { PageHeader } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";
import { getAdminFinancialTotalsFn, listAllInvoicesFn } from "@/lib/billing/functions";

export const Route = createFileRoute("/admin/payments/")({
  beforeLoad: requireRoleBeforeLoad("ADMIN"),
  head: () => ({
    meta: [
      { title: "Billing oversight — Medix" },
      { name: "description", content: "Platform-wide invoice and payment oversight." },
    ],
  }),
  component: AdminBilling,
});

type Row = Awaited<ReturnType<typeof listAllInvoicesFn>>["items"][number];
type Totals = Awaited<ReturnType<typeof getAdminFinancialTotalsFn>>;

function AdminBilling() {
  const { user } = Route.useRouteContext();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);

  const load = useCallback(() => {
    listAllInvoicesFn({ data: { page: 1, pageSize: 50 } })
      .then((page) => setRows(page.items))
      .catch(() => setRows([]));
    getAdminFinancialTotalsFn()
      .then(setTotals)
      .catch(() => undefined);
  }, []);

  useEffect(load, [load]);

  const columns: Column<Row>[] = [
    { key: "invoiceNumber", header: "Invoice", render: (r) => r.invoiceNumber },
    {
      key: "patient",
      header: "Patient",
      render: (r) => `${r.patientFirstName ?? ""} ${r.patientLastName ?? ""}`.trim() || "—",
    },
    { key: "hospital", header: "Hospital", render: (r) => r.hospitalName ?? "— (no hospital)" },
    {
      key: "total",
      header: "Total",
      render: (r) => <Money amount={r.total} currency={r.currency} />,
    },
    { key: "status", header: "Status", render: (r) => <InvoiceStatusBadge status={r.status} /> },
    {
      key: "action",
      header: "",
      render: (r) => (
        <Button asChild size="sm" variant="outline">
          <Link to="/admin/payments/$id" params={{ id: r.id }}>
            View
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <DashboardLayout role="admin" user={{ name: user.displayName, subtitle: "Platform admin" }}>
      <PageHeader
        title="Billing oversight"
        description="Read-only, platform-wide view of invoices and payment activity. No clinical content is shown here."
      />

      {totals && (
        <div className="mb-6 grid gap-4 sm:grid-cols-4">
          <StatCard label="Invoices" value={String(totals.invoiceCount)} />
          <StatCard
            label="Total invoiced"
            value={<Money amount={totals.totalInvoiced} currency="PKR" />}
          />
          <StatCard
            label="Total collected"
            value={<Money amount={totals.totalCollected} currency="PKR" />}
          />
          <StatCard
            label="Total refunded"
            value={<Money amount={totals.totalRefunded} currency="PKR" />}
          />
        </div>
      )}

      {rows === null ? (
        <p className="py-10 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          emptyTitle="No invoices yet"
          emptyDescription="Invoices appear here once appointments are confirmed."
        />
      )}
    </DashboardLayout>
  );
}

function StatCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xl font-semibold">{value}</CardContent>
    </Card>
  );
}
