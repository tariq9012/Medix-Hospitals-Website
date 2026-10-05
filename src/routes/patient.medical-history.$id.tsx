import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Building2, CalendarDays, User } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState, PageHeader } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";
import { getMyMedicalRecordFn } from "@/lib/clinical/functions";
import { listMyDocumentsForRecordFn } from "@/lib/documents/functions";

export const Route = createFileRoute("/patient/medical-history/$id")({
  beforeLoad: requireRoleBeforeLoad("PATIENT"),
  loader: async ({ params }) => {
    // Ownership is enforced inside getMyMedicalRecordFn's query itself — a
    // record that isn't this patient's returns null exactly like a
    // nonexistent id would, so nothing about it leaks.
    const record = await getMyMedicalRecordFn({ data: { recordId: params.id } });
    if (!record) throw notFound();
    // Best-effort: a failure fetching linked documents must never block
    // the record itself from rendering.
    const documents = await listMyDocumentsForRecordFn({
      data: { medicalRecordId: record.id },
    }).catch((error) => {
      console.error("[patient.medical-history.$id] documents lookup failed:", error);
      return [];
    });
    return { record, documents };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Record not found — Medix" }, { name: "robots", content: "noindex" }],
      };
    }
    return { meta: [{ title: "Medical record — Medix" }] };
  },
  notFoundComponent: () => (
    <DashboardLayout role="patient">
      <EmptyState
        title="Record not found"
        description="This record doesn't exist, or isn't associated with your account."
        action={
          <Button asChild>
            <Link to="/patient/medical-history">Back to medical history</Link>
          </Button>
        }
      />
    </DashboardLayout>
  ),
  component: PatientMedicalRecordDetail,
});

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function PatientMedicalRecordDetail() {
  const { user } = Route.useRouteContext();
  const { record, documents } = Route.useLoaderData();

  return (
    <DashboardLayout role="patient" user={{ name: user.displayName, subtitle: "Patient account" }}>
      <PageHeader
        breadcrumbs={[
          { label: "Medical History", to: "/patient/medical-history" },
          { label: formatDate(record.appointmentDate) },
        ]}
        title="Visit summary"
        description={`With Dr. ${record.doctorFirstName} ${record.doctorLastName} on ${formatDate(record.appointmentDate)}`}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Card>
          <CardContent className="space-y-6 p-6">
            {record.chiefComplaint && (
              <div className="space-y-1.5">
                <h3 className="font-semibold">Chief complaint</h3>
                <p className="text-sm text-muted-foreground">{record.chiefComplaint}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <h3 className="font-semibold">Diagnosis</h3>
              <p className="text-sm text-muted-foreground">{record.diagnosis || "—"}</p>
            </div>

            {record.symptoms && record.symptoms.length > 0 && (
              <div className="space-y-1.5">
                <h3 className="font-semibold">Symptoms</h3>
                <p className="text-sm text-muted-foreground">{record.symptoms.join(", ")}</p>
              </div>
            )}

            <Separator />

            {record.clinicalNotes && (
              <div className="space-y-1.5">
                <h3 className="font-semibold">Doctor's notes</h3>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {record.clinicalNotes}
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <h3 className="font-semibold">Treatment plan</h3>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {record.treatmentPlan || "—"}
              </p>
            </div>

            <div className="space-y-1.5">
              <h3 className="font-semibold">Follow-up</h3>
              <p className="text-sm text-muted-foreground">
                {record.followUpInstructions || "No follow-up instructions provided."}
                {record.followUpDate ? ` (by ${formatDate(record.followUpDate)})` : ""}
              </p>
            </div>
          </CardContent>
        </Card>

        <aside className="space-y-4">
          <Card>
            <CardContent className="space-y-4 p-6 text-sm">
              <Field icon={User} label="Doctor">
                Dr. {record.doctorFirstName} {record.doctorLastName}
                {record.specialtyName ? ` · ${record.specialtyName}` : ""}
              </Field>
              <Field icon={CalendarDays} label="Visit date">
                {formatDate(record.appointmentDate)}
              </Field>
              <Field icon={Building2} label="Location">
                {record.hospitalName ?? "Online"}
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <Button variant="outline" className="w-full" asChild>
                <Link to="/patient/prescriptions">View my prescriptions</Link>
              </Button>
            </CardContent>
          </Card>

          {documents.length > 0 && (
            <Card>
              <CardContent className="space-y-2 p-6">
                <p className="text-xs font-medium text-muted-foreground">
                  Documents ({documents.length})
                </p>
                {documents.map((doc) => (
                  <Link
                    key={doc.id}
                    to="/patient/reports/$id"
                    params={{ id: doc.id }}
                    className="block truncate rounded-md border border-border px-3 py-2 text-sm hover:bg-surface"
                  >
                    {doc.title}
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
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
  icon: typeof User;
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
