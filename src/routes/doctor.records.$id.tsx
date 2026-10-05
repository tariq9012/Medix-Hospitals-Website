import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { CalendarDays, Building2, Stethoscope, User } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { EmptyState, PageHeader } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { getDoctorMedicalRecordFn, updateMedicalRecordFn } from "@/lib/clinical/functions";
import { listDocumentsForMedicalRecordFn } from "@/lib/documents/functions";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

export const Route = createFileRoute("/doctor/records/$id")({
  beforeLoad: requireRoleBeforeLoad("DOCTOR"),
  loader: async ({ params }) => {
    const record = await getDoctorMedicalRecordFn({ data: { recordId: params.id } });
    if (!record) throw notFound();
    // Best-effort: a failure fetching linked documents must never block
    // the record itself from rendering.
    const documents = await listDocumentsForMedicalRecordFn({
      data: { medicalRecordId: record.id },
    }).catch((error) => {
      console.error("[doctor.records.$id] documents lookup failed:", error);
      return [];
    });
    return { record, documents };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Medical record not found — Medix" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const { record } = loaderData;
    const title = `Medical record — ${record.patientFirstName} ${record.patientLastName} — Medix`;
    return { meta: [{ title }, { name: "description", content: title }] };
  },
  notFoundComponent: () => (
    <DashboardLayout role="doctor">
      <EmptyState
        title="Medical record not found"
        description="This record doesn't exist, or wasn't created by your account."
        action={
          <Button asChild>
            <Link to="/doctor/records">Back to records</Link>
          </Button>
        }
      />
    </DashboardLayout>
  ),
  component: DoctorRecordDetail,
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

function DoctorRecordDetail() {
  const { user } = Route.useRouteContext();
  const { record, documents } = Route.useLoaderData();
  const [editing, setEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [diagnosis, setDiagnosis] = useState(record.diagnosis ?? "");
  const [clinicalNotes, setClinicalNotes] = useState(record.clinicalNotes ?? "");
  const [treatmentPlan, setTreatmentPlan] = useState(record.treatmentPlan ?? "");
  const [followUpInstructions, setFollowUpInstructions] = useState(
    record.followUpInstructions ?? "",
  );

  async function handleSave() {
    setIsSubmitting(true);
    try {
      const result = await updateMedicalRecordFn({
        data: {
          recordId: record.id,
          diagnosis,
          clinicalNotes: clinicalNotes || undefined,
          treatmentPlan: treatmentPlan || undefined,
          followUpInstructions: followUpInstructions || undefined,
        },
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Medical record updated.");
      setEditing(false);
      window.location.reload();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <DashboardLayout role="doctor" user={{ name: user.displayName, subtitle: "Doctor account" }}>
      <PageHeader
        breadcrumbs={[
          { label: "Medical Records", to: "/doctor/records" },
          { label: `${record.patientFirstName} ${record.patientLastName}` },
        ]}
        title={`${record.patientFirstName} ${record.patientLastName}`}
        description={`Visit on ${formatDate(record.appointmentDate)}`}
        actions={
          !editing ? (
            <Button onClick={() => setEditing(true)}>Edit record</Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditing(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSubmitting || diagnosis.trim().length === 0}>
                {isSubmitting ? "Saving…" : "Save changes"}
              </Button>
            </div>
          )
        }
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
              {editing ? (
                <Textarea
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  rows={2}
                />
              ) : (
                <p className="text-sm text-muted-foreground">{record.diagnosis || "—"}</p>
              )}
            </div>

            {record.symptoms && record.symptoms.length > 0 && (
              <div className="space-y-1.5">
                <h3 className="font-semibold">Symptoms</h3>
                <p className="text-sm text-muted-foreground">{record.symptoms.join(", ")}</p>
              </div>
            )}

            <Separator />

            <div className="space-y-1.5">
              <h3 className="font-semibold">Clinical notes</h3>
              {editing ? (
                <Textarea
                  value={clinicalNotes}
                  onChange={(e) => setClinicalNotes(e.target.value)}
                  rows={4}
                  placeholder="Clinical notes"
                />
              ) : (
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {record.clinicalNotes || "—"}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <h3 className="font-semibold">Treatment plan</h3>
              {editing ? (
                <Textarea
                  value={treatmentPlan}
                  onChange={(e) => setTreatmentPlan(e.target.value)}
                  rows={3}
                  placeholder="Treatment plan"
                />
              ) : (
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {record.treatmentPlan || "—"}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <h3 className="font-semibold">Follow-up instructions</h3>
              {editing ? (
                <Textarea
                  value={followUpInstructions}
                  onChange={(e) => setFollowUpInstructions(e.target.value)}
                  rows={2}
                  placeholder="Follow-up instructions"
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {record.followUpInstructions || "—"}
                  {record.followUpDate ? ` (by ${formatDate(record.followUpDate)})` : ""}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <aside className="space-y-4">
          <Card>
            <CardContent className="space-y-4 p-6 text-sm">
              <Field icon={User} label="Patient">
                {record.patientFirstName} {record.patientLastName}
              </Field>
              <Field icon={CalendarDays} label="Visit date">
                {formatDate(record.appointmentDate)}
              </Field>
              <Field icon={Building2} label="Location">
                {record.hospitalName ?? "Online"}
              </Field>
              <Field icon={Stethoscope} label="Last updated">
                {formatDate(record.updatedAt.toString().slice(0, 10))}
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 p-6">
              <Button variant="outline" className="w-full" asChild>
                <Link
                  to="/doctor/prescriptions/new"
                  search={{ appointmentId: record.appointmentId ?? "", recordId: record.id }}
                >
                  Create prescription
                </Link>
              </Button>
              <Button variant="outline" className="w-full" asChild>
                <Link
                  to="/doctor/reports/new"
                  search={{ appointmentId: record.appointmentId ?? "", recordId: record.id }}
                >
                  Upload document
                </Link>
              </Button>
            </CardContent>
          </Card>

          {documents.length > 0 && (
            <Card>
              <CardContent className="space-y-2 p-6">
                <p className="text-xs font-medium text-muted-foreground">
                  Linked documents ({documents.length})
                </p>
                {documents.map((doc) => (
                  <Link
                    key={doc.id}
                    to="/doctor/reports/$id"
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
