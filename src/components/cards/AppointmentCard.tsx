import { Link } from "@tanstack/react-router";
import { CalendarDays, Clock, MapPin, Video } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cancelAppointmentFn } from "@/lib/appointments/functions";
import { canPatientCancelAppointment, formatStatusLabel } from "@/lib/appointments/status";
import type { PatientAppointmentRow } from "@/lib/appointments/queries.server";

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatFee(fee: string | null): string {
  if (!fee) return "—";
  const n = Number(fee);
  return Number.isFinite(n) ? `PKR ${n.toLocaleString()}` : "—";
}

export function AppointmentCard({
  appointment,
  onCancelled,
}: {
  appointment: PatientAppointmentRow;
  onCancelled?: () => void;
}) {
  const [isCancelling, setIsCancelling] = useState(false);
  const canCancel = canPatientCancelAppointment(appointment);

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
      onCancelled?.();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{appointment.doctorName}</h3>
            <StatusBadge status={formatStatusLabel(appointment.status)} />
            <StatusBadge status={formatStatusLabel(appointment.paymentStatus)} />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-4" aria-hidden="true" />{" "}
              {formatDate(appointment.appointmentDate)}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="size-4" aria-hidden="true" /> {appointment.startTime.slice(0, 5)}
            </span>
            <span className="flex items-center gap-1.5">
              {appointment.consultationType === "ONLINE" ? (
                <>
                  <Video className="size-4" aria-hidden="true" /> Video consultation
                </>
              ) : (
                <>
                  <MapPin className="size-4" aria-hidden="true" />{" "}
                  {appointment.hospitalName ?? "In-person"}
                </>
              )}
            </span>
            <span>{formatFee(appointment.fee)}</span>
          </div>
          {appointment.reasonForVisit && (
            <p className="text-sm text-muted-foreground">Reason: {appointment.reasonForVisit}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button variant="outline" size="sm" asChild>
            <Link to="/patient/appointments/$id" params={{ id: appointment.id }}>
              View
            </Link>
          </Button>
          {canCancel && (
            <Button
              variant="ghost"
              size="sm"
              disabled={isCancelling}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={handleCancel}
            >
              {isCancelling ? "Cancelling…" : "Cancel"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
