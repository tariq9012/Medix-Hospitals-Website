import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { InvoiceStatusBadge } from "@/components/billing/InvoiceStatusBadge";
import { Money } from "@/components/billing/Money";
import { Column, DataTable } from "@/components/common/DataTable";
import { PageHeader } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";
import { listHospitalInvoicesFn } from "@/lib/billing/functions";
import type { InvoiceStatusFilter } from "@/lib/billing/queries.server";

export const Route = createFileRoute("/hospital/billing/")({
  beforeLoad: requireRoleBeforeLoad("HOSPITAL_ADMIN"),
  head: () => ({
    meta: [
      { title: "Billing — Medix" },
      { name: "description", content: "Invoices, payments and refunds for your hospital." },
    ],
  }),
  component: HospitalBilling,
});

type Row = Awaited<ReturnType<typeof listHospitalInvoicesFn>>["items"][number];

const STATUS_TABS: { value: InvoiceStatusFilter | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "ISSUED", label: "Unpaid" },
  { value: "PARTIALLY_PAID", label: "Partially paid" },
  { value: "PAID", label: "Paid" },
  { value: "REFUNDED", label: "Refunded" },
  { value: "VOID", label: "Void" },
];

function HospitalBilling() {
  const { user } = Route.useRouteContext();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [status, setStatus] = useState<InvoiceStatusFilter | "ALL">("ALL");
  const [search, setSearch] = useState("");

  const load = useCallback(() => {
    listHospitalInvoicesFn({
      data: {
        page: 1,
        pageSize: 50,
        status: status === "ALL" ? undefined : status,
        search: search || undefined,
      },
    })
      .then((page) => setRows(page.items))
      .catch(() => setRows([]));
  }, [status, search]);

  useEffect(load, [load]);

  const columns: Column<Row>[] = [
    { key: "invoiceNumber", header: "Invoice", render: (r) => r.invoiceNumber },
    {
      key: "patient",
      header: "Patient",
      render: (r) => `${r.patientFirstName ?? ""} ${r.patientLastName ?? ""}`.trim() || "—",
    },
    {
      key: "doctor",
      header: "Doctor",
      render: (r) => `Dr. ${r.doctorFirstName} ${r.doctorLastName}`,
    },
    {
      key: "total",
      header: "Total",
      render: (r) => <Money amount={r.total} currency={r.currency} />,
    },
    {
      key: "paid",
      header: "Paid",
      render: (r) => <Money amount={r.amountPaid} currency={r.currency} />,
    },
    { key: "status", header: "Status", render: (r) => <InvoiceStatusBadge status={r.status} /> },
    {
      key: "action",
      header: "",
      render: (r) => (
        <Button asChild size="sm" variant="outline">
          <Link to="/hospital/billing/$id" params={{ id: r.id }}>
            Manage
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <DashboardLayout role="hospital" user={{ name: user.displayName, subtitle: "Hospital admin" }}>
      <PageHeader title="Billing" description="Invoices, payments and refunds for your hospital." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((tab) => (
          <Button
            key={tab.value}
            size="sm"
            variant={status === tab.value ? "default" : "outline"}
            onClick={() => setStatus(tab.value)}
          >
            {tab.label}
          </Button>
        ))}
        <Input
          placeholder="Search invoice # or patient…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto max-w-xs"
        />
      </div>

      {rows === null ? (
        <p className="py-10 text-sm text-muted-foreground">Loading…</p>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          emptyTitle="No invoices"
          emptyDescription="An invoice appears here once a doctor confirms an appointment at your hospital."
        />
      )}
    </DashboardLayout>
  );
}
