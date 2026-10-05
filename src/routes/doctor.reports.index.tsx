import { createFileRoute, Link } from "@tanstack/react-router";

import { DataTable, type Column } from "@/components/common/DataTable";
import { PageHeader } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";
import { listDoctorDocumentsFn } from "@/lib/documents/functions";
import type { DoctorDocumentRow } from "@/lib/documents/queries.server";

export const Route = createFileRoute("/doctor/reports/")({
  beforeLoad: requireRoleBeforeLoad("DOCTOR"),
  loader: () => listDoctorDocumentsFn(),
  head: () => ({
    meta: [
      { title: "Reports — Medix" },
      { name: "description", content: "Documents you've uploaded for your patients." },
    ],
  }),
  component: DoctorReportsPage,
});

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDocumentType(type: string): string {
  return type
    .toLowerCase()
    .split("_")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

function DoctorReportsPage() {
  const { user } = Route.useRouteContext();
  const documents = Route.useLoaderData();

  const columns: Column<DoctorDocumentRow>[] = [
    { key: "date", header: "Date", render: (d) => formatDate(d.createdAt) },
    {
      key: "patient",
      header: "Patient",
      render: (d) => (
        <span className="font-medium">
          {d.patientFirstName} {d.patientLastName}
        </span>
      ),
    },
    { key: "title", header: "Title", render: (d) => d.title },
    { key: "type", header: "Type", render: (d) => formatDocumentType(d.documentType) },
    {
      key: "actions",
      header: "",
      render: (d) => (
        <Button variant="outline" size="sm" asChild>
          <Link to="/doctor/reports/$id" params={{ id: d.id }}>
            View
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <DashboardLayout role="doctor" user={{ name: user.displayName, subtitle: "Doctor account" }}>
      <PageHeader
        title="Reports & Documents"
        description="Lab reports, imaging, and other clinical documents you've uploaded."
      />
      <DataTable
        columns={columns}
        rows={documents}
        emptyTitle="No documents yet"
        emptyDescription="Upload a document from a completed appointment to see it here."
      />
    </DashboardLayout>
  );
}
