import { createFileRoute, Link } from "@tanstack/react-router";

import { DataTable, type Column } from "@/components/common/DataTable";
import { PageHeader } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";
import { listMyDocumentsFn } from "@/lib/documents/functions";
import type { PatientDocumentRow } from "@/lib/documents/queries.server";

export const Route = createFileRoute("/patient/reports/")({
  beforeLoad: requireRoleBeforeLoad("PATIENT"),
  loader: () => listMyDocumentsFn(),
  head: () => ({
    meta: [
      { title: "Lab Reports — Medix" },
      {
        name: "description",
        content: "View and download your lab reports and diagnostic results.",
      },
    ],
  }),
  component: PatientReportsPage,
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function PatientReportsPage() {
  const { user } = Route.useRouteContext();
  const documents = Route.useLoaderData();

  const columns: Column<PatientDocumentRow>[] = [
    { key: "date", header: "Date", render: (d) => formatDate(d.createdAt) },
    {
      key: "title",
      header: "Title",
      render: (d) => <span className="font-medium">{d.title}</span>,
    },
    { key: "type", header: "Type", render: (d) => formatDocumentType(d.documentType) },
    {
      key: "doctor",
      header: "Doctor",
      render: (d) => (d.doctorFirstName ? `Dr. ${d.doctorFirstName} ${d.doctorLastName}` : "—"),
    },
    { key: "size", header: "Size", render: (d) => formatFileSize(d.fileSize), hideOnCard: true },
    {
      key: "actions",
      header: "",
      render: (d) => (
        <Button variant="outline" size="sm" asChild>
          <Link to="/patient/reports/$id" params={{ id: d.id }}>
            View
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <DashboardLayout role="patient" user={{ name: user.displayName, subtitle: "Patient account" }}>
      <PageHeader
        title="Lab Reports & Documents"
        description="Reports, imaging, and other clinical documents from your doctors."
      />
      <DataTable
        columns={columns}
        rows={documents}
        emptyTitle="No documents yet"
        emptyDescription="Reports and documents your doctors upload will show up here."
      />
    </DashboardLayout>
  );
}
