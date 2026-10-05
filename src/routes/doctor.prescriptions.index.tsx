import { createFileRoute, Link } from "@tanstack/react-router";

import { DataTable, type Column } from "@/components/common/DataTable";
import { PageHeader, StatusBadge } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";
import { listDoctorPrescriptionsFn } from "@/lib/clinical/functions";
import type { DoctorPrescriptionRow } from "@/lib/clinical/queries.server";

export const Route = createFileRoute("/doctor/prescriptions/")({
  beforeLoad: requireRoleBeforeLoad("DOCTOR"),
  loader: () => listDoctorPrescriptionsFn(),
  head: () => ({
    meta: [
      { title: "Prescriptions — Medix" },
      { name: "description", content: "Prescriptions you've issued to patients." },
    ],
  }),
  component: DoctorPrescriptionsPage,
});

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function DoctorPrescriptionsPage() {
  const { user } = Route.useRouteContext();
  const prescriptions = Route.useLoaderData();

  const columns: Column<DoctorPrescriptionRow>[] = [
    {
      key: "patient",
      header: "Patient",
      render: (p) => (
        <span className="font-medium">
          {p.patientFirstName} {p.patientLastName}
        </span>
      ),
    },
    { key: "date", header: "Issued", render: (p) => formatDate(p.issuedDate) },
    { key: "items", header: "Medications", render: (p) => `${p.itemCount} item(s)` },
    { key: "status", header: "Status", render: (p) => <StatusBadge status={p.status} /> },
    {
      key: "actions",
      header: "",
      render: (p) => (
        <Button variant="outline" size="sm" asChild>
          <Link to="/doctor/prescriptions/$id" params={{ id: p.id }}>
            View
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <DashboardLayout role="doctor" user={{ name: user.displayName, subtitle: "Doctor account" }}>
      <PageHeader
        title="Prescriptions"
        description="Prescriptions you've issued for completed appointments."
      />
      <DataTable
        columns={columns}
        rows={prescriptions}
        emptyTitle="No prescriptions yet"
        emptyDescription="Issue a prescription from a completed appointment to see it here."
      />
    </DashboardLayout>
  );
}
