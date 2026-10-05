import { createFileRoute, Link } from "@tanstack/react-router";

import { DataTable, type Column } from "@/components/common/DataTable";
import { PageHeader, StatusBadge } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";
import { listMyPrescriptionsFn } from "@/lib/clinical/functions";
import type { PatientPrescriptionRow } from "@/lib/clinical/queries.server";

export const Route = createFileRoute("/patient/prescriptions/")({
  beforeLoad: requireRoleBeforeLoad("PATIENT"),
  loader: () => listMyPrescriptionsFn(),
  head: () => ({
    meta: [
      { title: "Prescriptions — Medix" },
      { name: "description", content: "Medications prescribed to you by your doctors." },
    ],
  }),
  component: PatientPrescriptionsPage,
});

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function PatientPrescriptionsPage() {
  const { user } = Route.useRouteContext();
  const prescriptions = Route.useLoaderData();

  const columns: Column<PatientPrescriptionRow>[] = [
    { key: "date", header: "Issued", render: (p) => formatDate(p.issuedDate) },
    {
      key: "doctor",
      header: "Doctor",
      render: (p) => (
        <span className="font-medium">
          Dr. {p.doctorFirstName} {p.doctorLastName}
        </span>
      ),
    },
    { key: "items", header: "Medications", render: (p) => `${p.itemCount} item(s)` },
    { key: "status", header: "Status", render: (p) => <StatusBadge status={p.status} /> },
    {
      key: "actions",
      header: "",
      render: (p) => (
        <Button variant="outline" size="sm" asChild>
          <Link to="/patient/prescriptions/$id" params={{ id: p.id }}>
            View
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <DashboardLayout role="patient" user={{ name: user.displayName, subtitle: "Patient account" }}>
      <PageHeader
        title="Prescriptions"
        description="Medications your doctors have prescribed you."
      />
      <DataTable
        columns={columns}
        rows={prescriptions}
        emptyTitle="No prescriptions yet"
        emptyDescription="Prescriptions from your completed appointments will show up here."
      />
    </DashboardLayout>
  );
}
