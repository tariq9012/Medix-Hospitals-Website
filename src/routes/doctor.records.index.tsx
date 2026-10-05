import { createFileRoute, Link } from "@tanstack/react-router";

import { DataTable, type Column } from "@/components/common/DataTable";
import { PageHeader } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";
import { listDoctorMedicalRecordsFn } from "@/lib/clinical/functions";
import type { DoctorMedicalRecordRow } from "@/lib/clinical/queries.server";

export const Route = createFileRoute("/doctor/records/")({
  beforeLoad: requireRoleBeforeLoad("DOCTOR"),
  loader: () => listDoctorMedicalRecordsFn(),
  head: () => ({
    meta: [
      { title: "Medical Records — Medix" },
      { name: "description", content: "Clinical records for your patients." },
    ],
  }),
  component: DoctorRecordsPage,
});

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function DoctorRecordsPage() {
  const { user } = Route.useRouteContext();
  const records = Route.useLoaderData();

  const columns: Column<DoctorMedicalRecordRow>[] = [
    {
      key: "patient",
      header: "Patient",
      render: (r) => (
        <span className="font-medium">
          {r.patientFirstName} {r.patientLastName}
        </span>
      ),
    },
    { key: "date", header: "Visit date", render: (r) => formatDate(r.appointmentDate) },
    { key: "hospital", header: "Location", render: (r) => r.hospitalName ?? "Online" },
    {
      key: "diagnosis",
      header: "Diagnosis",
      render: (r) => <span className="line-clamp-1">{r.diagnosis || "—"}</span>,
    },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <Button variant="outline" size="sm" asChild>
          <Link to="/doctor/records/$id" params={{ id: r.id }}>
            View
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <DashboardLayout role="doctor" user={{ name: user.displayName, subtitle: "Doctor account" }}>
      <PageHeader
        title="Medical Records"
        description="Clinical records you've created for completed appointments."
      />
      <DataTable
        columns={columns}
        rows={records}
        emptyTitle="No medical records yet"
        emptyDescription="Create a medical record from a completed appointment to see it here."
      />
    </DashboardLayout>
  );
}
