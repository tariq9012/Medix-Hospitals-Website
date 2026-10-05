import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CalendarCheck, CalendarDays, FileText, FlaskConical, Loader2, Pill } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { AppointmentCard } from "@/components/cards/AppointmentCard";
import { DoctorCard } from "@/components/cards/DoctorCard";
import { EmptyState, PageHeader, SectionHeading, StatCard, StatusBadge } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cancelAppointmentFn, listMyAppointmentsFn } from "@/lib/appointments/functions";
import type { PatientAppointmentRow } from "@/lib/appointments/queries.server";
import { formatStatusLabel, isUpcomingAppointment } from "@/lib/appointments/status";
import { searchDoctorsFn } from "@/lib/directory/functions";
import type { PublicDoctorCard } from "@/lib/directory/types";
import { formatDate } from "@/lib/format";
// Prescriptions / reports widgets on this dashboard are still static (out of Phase 13 scope).
import { prescriptions, reports } from "@/data/mock";

export const Route = createFileRoute("/patient/dashboard")({
  beforeLoad: requireRoleBeforeLoad("PATIENT"),
  head: () => ({
    meta: [
      { title: "Patient Dashboard — Medix" },
      {
        name: "description",
        content:
          "Your Medix overview: upcoming appointments, prescriptions, lab reports and recommended doctors in one place.",
      },
      { property: "og:title", content: "Patient Dashboard — Medix" },
      {
        property: "og:description",
        content: "Appointments, prescriptions and reports at a glance.",
      },
    ],
  }),
  component: PatientDashboard,
});

function formatFee(fee: string | null): string {
  if (!fee) return "—";
  const n = Number(fee);
  return Number.isFinite(n) ? `PKR ${n.toLocaleString()}` : "—";
}

function PatientDashboard() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState<PatientAppointmentRow[] | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [popular, setPopular] = useState<PublicDoctorCard[]>([]);

  useEffect(() => {
    searchDoctorsFn({ data: { pageSize: 4 } })
      .then((r) => setPopular(r.results.items))
      .catch(() => setPopular([]));
  }, []);

  const load = useCallback(() => {
    listMyAppointmentsFn()
      .then(setAppointments)
      .catch(() => setAppointments([]));
  }, []);

  useEffect(load, [load]);

  const mine = appointments ?? [];
  const upcoming = mine
    .filter((a) => (a.status === "PENDING" || a.status === "CONFIRMED") && isUpcomingAppointment(a))
    .sort((a, b) =>
      (a.appointmentDate + a.startTime).localeCompare(b.appointmentDate + b.startTime),
    );
  const completed = mine.filter(
    (a) =>
      a.status === "COMPLETED" ||
      ((a.status === "PENDING" || a.status === "CONFIRMED") && !isUpcomingAppointment(a)),
  );
  const next = upcoming[0];

  async function handleCancelNext() {
    if (!next) return;
    if (!confirm("Cancel this appointment? This can't be undone.")) return;
    setIsCancelling(true);
    try {
      const result = await cancelAppointmentFn({ data: { appointmentId: next.id } });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Appointment cancelled.");
      load();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsCancelling(false);
    }
  }

  const activity = [
    ...completed.slice(0, 2).map((a) => ({
      id: a.id,
      title: `Appointment with ${a.doctorName}`,
      meta: `${formatDate(a.appointmentDate)}`,
      badge: "Completed",
    })),
    ...prescriptions.slice(0, 2).map((p) => ({
      id: p.id,
      title: `Prescription ${p.id} issued`,
      meta: `${formatDate(p.date)} · ${p.doctor}`,
      badge: p.status === "active" ? "Active" : "Completed",
    })),
    ...reports.slice(0, 2).map((r) => ({
      id: r.id,
      title: `${r.name} uploaded`,
      meta: `${formatDate(r.date)} · ${r.doctor}`,
      badge: r.category,
    })),
  ];

  return (
    <DashboardLayout role="patient" user={{ name: user.displayName, subtitle: "Patient account" }}>
      <PageHeader
        title={`Welcome back, ${user.displayName.split(" ")[0]}`}
        description="Here's what's happening with your care this week."
        actions={
          <Button asChild>
            <Link to="/book">Book appointment</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Upcoming appointments" value={upcoming.length} icon={CalendarDays} />
        <StatCard
          label="Completed appointments"
          value={completed.length}
          icon={CalendarCheck}
          tone="success"
        />
        <StatCard label="Prescriptions" value={prescriptions.length} icon={Pill} tone="accent" />
        <StatCard
          label="Medical reports"
          value={reports.length}
          icon={FlaskConical}
          tone="warning"
        />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-8">
          <section>
            <SectionHeading
              title="Your next appointment"
              action={
                <Button variant="outline" size="sm" asChild>
                  <Link to="/patient/appointments">View all</Link>
                </Button>
              }
            />
            {appointments === null ? (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading…
              </div>
            ) : next ? (
              <Card>
                <CardContent className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center">
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-xl font-bold">{next.doctorName}</h3>
                      <StatusBadge status={formatStatusLabel(next.status)} />
                      <Badge variant="secondary">
                        {next.consultationType === "ONLINE" ? "Video consultation" : "In-person"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(next.appointmentDate)} at {next.startTime.slice(0, 5)}
                      {next.hospitalName ? ` · ${next.hospitalName}` : ""}
                    </p>
                    {next.reasonForVisit && (
                      <p className="text-sm text-muted-foreground">{next.reasonForVisit}</p>
                    )}
                    <p className="text-sm">
                      Fee <strong>{formatFee(next.fee)}</strong> ·{" "}
                      <StatusBadge status={formatStatusLabel(next.paymentStatus)} />
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:flex-col">
                    <Button variant="outline" asChild>
                      <Link to="/patient/appointments/$id" params={{ id: next.id }}>
                        View details
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      className="text-destructive"
                      disabled={isCancelling}
                      onClick={handleCancelNext}
                    >
                      {isCancelling ? "Cancelling…" : "Cancel"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="No upcoming appointments"
                description="Book a consultation and it will show up here."
                action={
                  <Button asChild>
                    <Link to="/doctors">Find a doctor</Link>
                  </Button>
                }
              />
            )}
          </section>

          <section>
            <SectionHeading
              title="Popular doctors"
              description="Verified doctors, ordered by patient rating and reviews."
            />
            {popular.length === 0 ? (
              <EmptyState title="No doctors listed yet" />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {popular.map((d) => (
                  <DoctorCard key={d.id} doctor={d} viewerRole="PATIENT" />
                ))}
              </div>
            )}
          </section>

          <section>
            <SectionHeading title="Other upcoming" />
            <div className="grid gap-4">
              {upcoming.slice(1).map((a) => (
                <AppointmentCard key={a.id} appointment={a} onCancelled={load} />
              ))}
              {upcoming.length <= 1 && (
                <EmptyState title="Nothing else scheduled" description="Your calendar is clear." />
              )}
            </div>
          </section>
        </div>

        <aside>
          <SectionHeading title="Recent activity" />
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {activity.map((a) => (
                <div key={a.id} className="flex items-start gap-3 p-4">
                  <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                    <FileText className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{a.meta}</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-[11px]">
                    {a.badge}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </aside>
      </div>
    </DashboardLayout>
  );
}
