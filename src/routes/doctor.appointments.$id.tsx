import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Building2, CalendarDays, Clock, User, Video } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, PageHeader, StatusBadge } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { MessageButton } from "@/components/messaging/MessageButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { formatStatusLabel } from "@/lib/appointments/status";
import {
  getMedicalRecordForAppointmentFn,
  getPrescriptionForAppointmentFn,
} from "@/lib/clinical/functions";
import { listDocumentsForAppointmentFn } from "@/lib/documents/functions";
import { getDoctorAppointmentFn, updateDoctorAppointmentStatusFn } from "@/lib/doctor/functions";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

export const Route = createFileRoute("/doctor/appointments/$id")({
  beforeLoad: requireRoleBeforeLoad("DOCTOR"),
  loader: async ({ params }) => {
    const appointment = await getDoctorAppointmentFn({ data: { appointmentId: params.id } });
    if (!appointment) throw notFound();
    // Clinical creation controls only ever matter for COMPLETED
    // appointments — skip the extra queries otherwise. These are
    // best-effort: a failure fetching the linked record/prescription/
    // documents must never block the appointment detail page itself from
    // rendering, so each call degrades to an empty result instead of
    // throwing (a thrown loader error here would silently strand the
    // page on its previous route with no visible error, since this route
    // has no dedicated errorComponent).
    let medicalRecord = null;
    let prescription = null;
    let documents: Awaited<ReturnType<typeof listDocumentsForAppointmentFn>> = [];
    if (appointment.status === "COMPLETED") {
      const results = await Promise.allSettled([
        getMedicalRecordForAppointmentFn({ data: { appointmentId: appointment.id } }),
        getPrescriptionForAppointmentFn({ data: { appointmentId: appointment.id } }),
        listDocumentsForAppointmentFn({ data: { appointmentId: appointment.id } }),
      ]);
      const [recordResult, prescriptionResult, documentsResult] = results;
      if (recordResult.status === "fulfilled") medicalRecord = recordResult.value;
      else
        console.error(
          "[doctor.appointments.$id] medical record lookup failed:",
          recordResult.reason,
        );
      if (prescriptionResult.status === "fulfilled") prescription = prescriptionResult.value;
      else
        console.error(
          "[doctor.appointments.$id] prescription lookup failed:",
          prescriptionResult.reason,
        );
      if (documentsResult.status === "fulfilled") documents = documentsResult.value;
      else
        console.error("[doctor.appointments.$id] documents lookup failed:", documentsResult.reason);
    }
    return { appointment, medicalRecord, prescription, documents };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Appointment not found — Medix" }, { name: "robots", content: "noindex" }],
      };
    }
    const { appointment } = loaderData;
    const title = `Appointment with ${appointment.patientFirstName} ${appointment.patientLastName} — Medix`;
    return { meta: [{ title }, { name: "description", content: title }] };
  },
  notFoundComponent: () => (
    <DashboardLayout role="doctor">
      <EmptyState
        title="Appointment not found"
        description="This appointment doesn't exist, or doesn't belong to your account."
        action={
          <Button asChild>
            <Link to="/doctor/appointments">Back to appointments</Link>
          </Button>
        }
      />
    </DashboardLayout>
  ),
  component: DoctorAppointmentDetail,
});

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatFee(fee: string | null): string {
  if (!fee) return "—";
  const n = Number(fee);
  return Number.isFinite(n) ? `PKR ${n.toLocaleString()}` : "—";
}

function DoctorAppointmentDetail() {
  const { user } = Route.useRouteContext();
  const { appointment, medicalRecord, prescription, documents } = Route.useLoaderData();
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelForm, setShowCancelForm] = useState(false);

  async function runAction(
    action: "CONFIRM" | "COMPLETE" | "NO_SHOW" | "CANCEL",
    cancellationReason?: string,
  ) {
    setIsSubmitting(action);
    try {
      const result = await updateDoctorAppointmentStatusFn({
        data: { appointmentId: appointment.id, action, cancellationReason },
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(`Appointment marked ${formatStatusLabel(result.status).toLowerCase()}.`);
      // Simplest reliable way to get the loader's fresh data onto the page.
      window.location.reload();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(null);
    }
  }

  const canConfirm = appointment.status === "PENDING";
  const canCompleteOrNoShow = appointment.status === "CONFIRMED";
  const canCancel = appointment.status === "PENDING" || appointment.status === "CONFIRMED";

  return (
    <DashboardLayout role="doctor" user={{ name: user.displayName, subtitle: "Doctor account" }}>
      <PageHeader
        breadcrumbs={[
          { label: "Appointments", to: "/doctor/appointments" },
          { label: appointment.id.slice(0, 8).toUpperCase() },
        ]}
        title={`${appointment.patientFirstName} ${appointment.patientLastName}`}
        description={appointment.reasonForVisit ?? undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={formatStatusLabel(appointment.status)} />
            <MessageButton as="doctor" targetId={appointment.patientId} />
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardContent className="space-y-6 p-6">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field
                icon={CalendarDays}
                label="Date"
                value={formatDate(appointment.appointmentDate)}
              />
              <Field icon={Clock} label="Time" value={appointment.startTime.slice(0, 5)} />
              <Field
                icon={Video}
                label="Type"
                value={
                  appointment.consultationType === "ONLINE"
                    ? "Video consultation"
                    : "In-person visit"
                }
              />
              <Field
                icon={Building2}
                label="Location"
                value={appointment.hospitalName ?? "Online"}
              />
            </dl>

            <Separator />

            <div className="space-y-2">
              <h3 className="font-semibold">Reason for visit</h3>
              <p className="text-sm text-muted-foreground">
                {appointment.reasonForVisit ?? "Not provided."}
              </p>
            </div>

            {appointment.patientNotes && (
              <div className="space-y-2">
                <h3 className="font-semibold">Patient notes</h3>
                <p className="text-sm text-muted-foreground">{appointment.patientNotes}</p>
              </div>
            )}

            <Separator />

            <Link
              to="/doctor/patients/$id"
              params={{ id: appointment.patientId }}
              className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              <User className="size-4" aria-hidden="true" /> View patient profile
            </Link>
          </CardContent>
        </Card>

        <aside className="space-y-4">
          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Consultation fee</span>
                <span className="font-display text-xl font-bold">{formatFee(appointment.fee)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Payment</span>
                <StatusBadge status={formatStatusLabel(appointment.paymentStatus)} />
              </div>

              {appointment.status === "CANCELLED" && appointment.cancellationReason && (
                <>
                  <Separator />
                  <div className="space-y-1">
                    <span className="text-sm text-muted-foreground">Cancellation reason</span>
                    <p className="text-sm">{appointment.cancellationReason}</p>
                  </div>
                </>
              )}

              {(canConfirm || canCompleteOrNoShow || canCancel) && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    {canConfirm && (
                      <Button
                        className="w-full"
                        disabled={isSubmitting !== null}
                        onClick={() => runAction("CONFIRM")}
                      >
                        {isSubmitting === "CONFIRM" ? "Confirming…" : "Confirm appointment"}
                      </Button>
                    )}
                    {canCompleteOrNoShow && (
                      <>
                        <Button
                          className="w-full"
                          disabled={isSubmitting !== null}
                          onClick={() => runAction("COMPLETE")}
                        >
                          {isSubmitting === "COMPLETE" ? "Saving…" : "Mark completed"}
                        </Button>
                        <Button
                          variant="outline"
                          className="w-full"
                          disabled={isSubmitting !== null}
                          onClick={() => runAction("NO_SHOW")}
                        >
                          {isSubmitting === "NO_SHOW" ? "Saving…" : "Mark as no-show"}
                        </Button>
                      </>
                    )}
                    {canCancel &&
                      (showCancelForm ? (
                        <div className="space-y-2 rounded-lg border border-border p-3">
                          <Textarea
                            placeholder="Reason for cancelling (required)"
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            rows={2}
                          />
                          <div className="flex gap-2">
                            <Button
                              variant="destructive"
                              size="sm"
                              className="flex-1"
                              disabled={isSubmitting !== null || cancelReason.trim().length === 0}
                              onClick={() => runAction("CANCEL", cancelReason.trim())}
                            >
                              {isSubmitting === "CANCEL" ? "Cancelling…" : "Confirm cancellation"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowCancelForm(false)}
                            >
                              Back
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          className="w-full text-destructive"
                          disabled={isSubmitting !== null}
                          onClick={() => setShowCancelForm(true)}
                        >
                          Cancel appointment
                        </Button>
                      ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {appointment.status === "COMPLETED" && (
            <Card>
              <CardContent className="space-y-3 p-6">
                <h3 className="font-semibold">Clinical</h3>
                {medicalRecord ? (
                  <Button variant="outline" className="w-full" asChild>
                    <Link to="/doctor/records/$id" params={{ id: medicalRecord.id }}>
                      View medical record
                    </Link>
                  </Button>
                ) : (
                  <Button className="w-full" asChild>
                    <Link to="/doctor/records/new" search={{ appointmentId: appointment.id }}>
                      Create medical record
                    </Link>
                  </Button>
                )}

                {prescription ? (
                  <Button variant="outline" className="w-full" asChild>
                    <Link to="/doctor/prescriptions/$id" params={{ id: prescription.id }}>
                      View prescription
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full" asChild>
                    <Link
                      to="/doctor/prescriptions/new"
                      search={{
                        appointmentId: appointment.id,
                        recordId: medicalRecord?.id,
                      }}
                    >
                      Create prescription
                    </Link>
                  </Button>
                )}

                <Button variant="outline" className="w-full" asChild>
                  <Link
                    to="/doctor/reports/new"
                    search={{ appointmentId: appointment.id, recordId: medicalRecord?.id }}
                  >
                    Upload medical document
                  </Link>
                </Button>

                {documents.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Documents ({documents.length})
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
                  </div>
                )}
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
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div>
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="font-medium">{value}</dd>
      </div>
    </div>
  );
}
