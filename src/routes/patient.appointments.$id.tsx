import { ReviewPanel } from "@/components/directory/ReviewPanel";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { Building2, CalendarDays, Clock, Video } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, PageHeader, StatusBadge } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { MessageButton } from "@/components/messaging/MessageButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cancelAppointmentFn, getMyAppointmentFn } from "@/lib/appointments/functions";
import { canPatientCancelAppointment, formatStatusLabel } from "@/lib/appointments/status";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

export const Route = createFileRoute("/patient/appointments/$id")({
  beforeLoad: requireRoleBeforeLoad("PATIENT"),
  loader: async ({ params }) => {
    // Ownership is enforced inside getMyAppointmentFn (via the authenticated
    // session) — a mismatched id simply returns null here, exactly like a
    // nonexistent appointment would, so no detail is ever leaked either way.
    const appointment = await getMyAppointmentFn({ data: { appointmentId: params.id } });
    if (!appointment) throw notFound();
    return { appointment };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Appointment not found — Medix" }, { name: "robots", content: "noindex" }],
      };
    }
    const { appointment } = loaderData;
    const title = `Appointment with ${appointment.doctorName} — Medix`;
    return {
      meta: [
        { title },
        { name: "description", content: title },
        { property: "og:title", content: title },
      ],
    };
  },
  notFoundComponent: () => (
    <DashboardLayout role="patient">
      <EmptyState
        title="Appointment not found"
        description="This appointment doesn't exist, or doesn't belong to your account."
        action={
          <Button asChild>
            <Link to="/patient/appointments">Back to appointments</Link>
          </Button>
        }
      />
    </DashboardLayout>
  ),
  component: AppointmentDetail,
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

function AppointmentDetail() {
  const { user } = Route.useRouteContext();
  const { appointment } = Route.useLoaderData();
  const navigate = useNavigate();
  const [isCancelling, setIsCancelling] = useState(false);

  async function handleCancel() {
    if (!confirm("Cancel this appointment? This can't be undone.")) return;
    setIsCancelling(true);
    try {
      const result = await cancelAppointmentFn({ data: { appointmentId: appointment.id } });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Appointment cancelled.");
      await navigate({ to: "/patient/appointments" });
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <DashboardLayout role="patient" user={{ name: user.displayName, subtitle: "Patient account" }}>
      <PageHeader
        breadcrumbs={[
          { label: "Appointments", to: "/patient/appointments" },
          { label: appointment.id.slice(0, 8).toUpperCase() },
        ]}
        title={`Appointment with ${appointment.doctorName}`}
        description={appointment.reasonForVisit ?? undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={formatStatusLabel(appointment.status)} />
            <MessageButton as="patient" targetId={appointment.doctorId} />
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardContent className="space-y-6 p-6">
            <div className="flex flex-wrap items-center gap-4">
              {appointment.doctorProfileImage ? (
                <img
                  src={appointment.doctorProfileImage}
                  alt=""
                  className="size-16 rounded-xl object-cover"
                />
              ) : (
                <span className="grid size-16 shrink-0 place-items-center rounded-xl bg-primary-soft text-lg font-semibold text-primary">
                  {appointment.doctorName
                    .replace("Dr. ", "")
                    .split(" ")
                    .map((w) => w[0])
                    .slice(0, 2)
                    .join("")}
                </span>
              )}
              <div>
                <h2 className="font-display text-xl font-bold">{appointment.doctorName}</h2>
              </div>
            </div>

            <Separator />

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
                <h3 className="font-semibold">Notes</h3>
                <p className="text-sm text-muted-foreground">{appointment.patientNotes}</p>
              </div>
            )}
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
              {appointment.paymentStatus === "PENDING" && (
                <p className="text-xs text-muted-foreground">
                  Online payment isn't available yet — this is settled at your visit.
                </p>
              )}
              {appointment.status === "CANCELLED" && appointment.cancellationReason && (
                <>
                  <Separator />
                  <div className="space-y-1">
                    <span className="text-sm text-muted-foreground">Cancellation reason</span>
                    <p className="text-sm">{appointment.cancellationReason}</p>
                  </div>
                </>
              )}
              <Separator />
              {canPatientCancelAppointment(appointment) && (
                <Button
                  variant="outline"
                  className="w-full text-destructive"
                  disabled={isCancelling}
                  onClick={handleCancel}
                >
                  {isCancelling ? "Cancelling…" : "Cancel appointment"}
                </Button>
              )}
            </CardContent>
          </Card>
          {appointment.status === "COMPLETED" && <ReviewPanel appointmentId={appointment.id} />}
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
