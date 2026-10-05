import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { CalendarDays, Download, Eye, FileText, Stethoscope } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { EmptyState, PageHeader } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";
import { openMedicalDocument } from "@/lib/documents/download-client";
import { getMyDocumentFn } from "@/lib/documents/functions";

export const Route = createFileRoute("/patient/reports/$id")({
  beforeLoad: requireRoleBeforeLoad("PATIENT"),
  loader: async ({ params }) => {
    const document = await getMyDocumentFn({ data: { documentId: params.id } });
    if (!document) throw notFound();
    return { document };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Document not found — Medix" }, { name: "robots", content: "noindex" }],
      };
    }
    return { meta: [{ title: `${loaderData.document.title} — Medix` }] };
  },
  notFoundComponent: () => (
    <DashboardLayout role="patient">
      <EmptyState
        title="Document not found"
        description="This document doesn't exist, or isn't associated with your account."
        action={
          <Button asChild>
            <Link to="/patient/reports">Back to reports</Link>
          </Button>
        }
      />
    </DashboardLayout>
  ),
  component: PatientDocumentDetail,
});

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
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

function PatientDocumentDetail() {
  const { user } = Route.useRouteContext();
  const { document } = Route.useLoaderData();
  const [busy, setBusy] = useState<"view" | "download" | null>(null);

  async function handleOpen(mode: "view" | "download") {
    setBusy(mode);
    try {
      const result = await openMedicalDocument(document.id, mode);
      if (!result.ok) toast.error(result.message);
    } catch {
      toast.error("Could not open this document. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <DashboardLayout role="patient" user={{ name: user.displayName, subtitle: "Patient account" }}>
      <PageHeader
        breadcrumbs={[{ label: "Reports", to: "/patient/reports" }, { label: document.title }]}
        title={document.title}
        description={`Uploaded ${formatDate(document.createdAt)}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleOpen("view")} disabled={busy !== null}>
              <Eye className="size-4" aria-hidden="true" />
              {busy === "view" ? "Opening…" : "View"}
            </Button>
            <Button onClick={() => handleOpen("download")} disabled={busy !== null}>
              <Download className="size-4" aria-hidden="true" />
              {busy === "download" ? "Downloading…" : "Download"}
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Card>
          <CardContent className="space-y-4 p-6">
            {document.description && (
              <div className="space-y-1.5">
                <h3 className="font-semibold">Description</h3>
                <p className="text-sm text-muted-foreground">{document.description}</p>
              </div>
            )}
            <div className="flex items-center gap-3 rounded-lg border border-border p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                <FileText className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium">{document.originalFilename}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(document.fileSize)} · {document.mimeType}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <aside className="space-y-4">
          <Card>
            <CardContent className="space-y-4 p-6 text-sm">
              <Field icon={FileText} label="Type">
                {formatDocumentType(document.documentType)}
              </Field>
              <Field icon={CalendarDays} label="Uploaded">
                {formatDate(document.createdAt)}
              </Field>
              {document.doctorFirstName && (
                <Field icon={Stethoscope} label="Doctor">
                  Dr. {document.doctorFirstName} {document.doctorLastName}
                </Field>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </DashboardLayout>
  );
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof FileText;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div>
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <p className="font-medium">{children}</p>
      </div>
    </div>
  );
}
