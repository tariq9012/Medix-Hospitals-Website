import { createFileRoute, Link } from "@tanstack/react-router";

import { DataTable, type Column } from "@/components/common/DataTable";
import { PageHeader } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";
import { listMyMedicalRecordsFn } from "@/lib/clinical/functions";
import type { PatientMedicalRecordRow } from "@/lib/clinical/queries.server";

export const Route = createFileRoute("/patient/medical-history/")({
  beforeLoad: requireRoleBeforeLoad("PATIENT"),
  loader: () => listMyMedicalRecordsFn(),
  head: () => ({
    meta: [
      { title: "Medical History — Medix" },
      {
        name: "description",
        content: "A timeline of your diagnoses, doctor's notes, and treatment plans.",
      },
    ],
  }),
  component: MedicalHistoryPage,
});

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function MedicalHistoryPage() {
  const { user } = Route.useRouteContext();
  const records = Route.useLoaderData();

  const columns: Column<PatientMedicalRecordRow>[] = [
    { key: "date", header: "Visit date", render: (r) => formatDate(r.appointmentDate) },
    {
      key: "doctor",
      header: "Doctor",
      render: (r) => (
        <span className="font-medium">
          Dr. {r.doctorFirstName} {r.doctorLastName}
        </span>
      ),
    },
    {
      key: "specialty",
      header: "Specialty",
      render: (r) => r.specialtyName ?? "—",
      hideOnCard: true,
    },
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
          <Link to="/patient/medical-history/$id" params={{ id: r.id }}>
            View
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <DashboardLayout role="patient" user={{ name: user.displayName, subtitle: "Patient account" }}>
      <PageHeader
        title="Medical history"
        description="Every diagnosis, note and treatment plan from your visits, in order."
      />
      <DataTable
        columns={columns}
        rows={records}
        emptyTitle="No medical history yet"
        emptyDescription="Records from your completed appointments will show up here."
      />
    </DashboardLayout>
  );
}
