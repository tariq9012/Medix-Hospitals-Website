import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AppointmentCard } from "@/components/cards/AppointmentCard";
import { EmptyState, PageHeader } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listMyAppointmentsFn } from "@/lib/appointments/functions";
import type { PatientAppointmentRow } from "@/lib/appointments/queries.server";
import { isUpcomingAppointment } from "@/lib/appointments/status";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

export const Route = createFileRoute("/patient/appointments/")({
  beforeLoad: requireRoleBeforeLoad("PATIENT"),
  head: () => ({
    meta: [
      { title: "My Appointments — Medix" },
      {
        name: "description",
        content: "Track upcoming, completed and cancelled appointments.",
      },
      { property: "og:title", content: "My Appointments — Medix" },
      { property: "og:description", content: "Upcoming, completed and cancelled appointments." },
    ],
  }),
  component: PatientAppointments,
});

function PatientAppointments() {
  const { user } = Route.useRouteContext();
  const [appointments, setAppointments] = useState<PatientAppointmentRow[] | null>(null);

  const load = useCallback(() => {
    listMyAppointmentsFn()
      .then(setAppointments)
      .catch(() => setAppointments([]));
  }, []);

  useEffect(load, [load]);

  const groups = appointments
    ? {
        upcoming: appointments.filter(
          (a) => (a.status === "PENDING" || a.status === "CONFIRMED") && isUpcomingAppointment(a),
        ),
        completed: appointments.filter(
          (a) =>
            a.status === "COMPLETED" ||
            ((a.status === "PENDING" || a.status === "CONFIRMED") && !isUpcomingAppointment(a)),
        ),
        cancelled: appointments.filter((a) => a.status === "CANCELLED" || a.status === "NO_SHOW"),
      }
    : { upcoming: [], completed: [], cancelled: [] };

  return (
    <DashboardLayout role="patient" user={{ name: user.displayName, subtitle: "Patient account" }}>
      <PageHeader
        title="My appointments"
        description="Everything you've booked, in one timeline."
        actions={
          <Button asChild>
            <Link to="/book">Book appointment</Link>
          </Button>
        }
      />

      {appointments === null ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading your appointments…
        </div>
      ) : (
        <Tabs defaultValue="upcoming">
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming ({groups.upcoming.length})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({groups.completed.length})</TabsTrigger>
            <TabsTrigger value="cancelled">Cancelled ({groups.cancelled.length})</TabsTrigger>
          </TabsList>

          {(["upcoming", "completed", "cancelled"] as const).map((key) => (
            <TabsContent key={key} value={key} className="mt-5">
              {groups[key].length === 0 ? (
                <EmptyState
                  icon={CalendarDays}
                  title={`No ${key} appointments`}
                  description={
                    key === "upcoming"
                      ? "Book a consultation and it will appear here."
                      : "Nothing to show in this tab yet."
                  }
                  action={
                    key === "upcoming" ? (
                      <Button asChild>
                        <Link to="/doctors">Find a doctor</Link>
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <div className="grid gap-4">
                  {groups[key].map((a) => (
                    <AppointmentCard key={a.id} appointment={a} onCancelled={load} />
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </DashboardLayout>
  );
}
