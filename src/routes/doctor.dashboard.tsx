import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  Clock,
  ShieldAlert,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  EmptyState,
  ErrorState,
  PageHeader,
  SectionHeading,
  StatCard,
  StatusBadge,
} from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getDoctorDashboardFn } from "@/lib/doctor/functions";
import { formatStatusLabel } from "@/lib/appointments/status";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

export const Route = createFileRoute("/doctor/dashboard")({
  beforeLoad: requireRoleBeforeLoad("DOCTOR"),
  head: () => ({
    meta: [
      { title: "Doctor Dashboard — Medix" },
      { name: "description", content: "An overview of your day's appointments and patients." },
    ],
  }),
  component: DoctorDashboard,
});

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
  });
}

type Dashboard = Awaited<ReturnType<typeof getDoctorDashboardFn>>;

function DoctorDashboard() {
  const { user } = Route.useRouteContext();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState(false);

  function load() {
    setError(false);
    setData(null);
    getDoctorDashboardFn()
      .then(setData)
      .catch(() => setError(true));
  }

  useEffect(load, []);

  return (
    <DashboardLayout role="doctor" user={{ name: user.displayName, subtitle: "Doctor account" }}>
      <PageHeader
        title={`Welcome back, ${user.displayName}`}
        description="Here's what's happening with your practice today."
      />

      {error ? (
        <ErrorState onRetry={load} />
      ) : !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {data.doctor.verificationStatus !== "APPROVED" && (
            <Card className="mb-6 border-warning/40 bg-warning/10">
              <CardContent className="flex items-start gap-3 p-4">
                <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
                <div className="text-sm">
                  <p className="font-medium">Your provider verification is pending</p>
                  <p className="text-muted-foreground">
                    You can sign in and view your dashboard, but confirming appointments and
                    managing availability stays locked until an admin approves your account.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard
              label="Today's appointments"
              value={data.stats.todayCount}
              icon={CalendarDays}
            />
            <StatCard
              label="Upcoming"
              value={data.stats.upcomingCount}
              icon={CalendarClock}
              tone="accent"
            />
            <StatCard
              label="Pending confirmation"
              value={data.stats.pendingCount}
              icon={Clock}
              tone="warning"
            />
            <StatCard
              label="Completed"
              value={data.stats.completedCount}
              icon={CalendarCheck}
              tone="success"
            />
            <StatCard label="Total patients" value={data.stats.totalPatients} icon={Users} />
          </div>

          <div className="mt-8">
            <SectionHeading
              title="Next appointment"
              action={
                <Button variant="outline" size="sm" asChild>
                  <Link to="/doctor/appointments">View all</Link>
                </Button>
              }
            />
            {data.stats.nextAppointment ? (
              <Card>
                <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">
                        {data.stats.nextAppointment.patientFirstName}{" "}
                        {data.stats.nextAppointment.patientLastName}
                      </h3>
                      <StatusBadge status={formatStatusLabel(data.stats.nextAppointment.status)} />
                      <Badge variant="secondary">
                        {data.stats.nextAppointment.consultationType === "ONLINE"
                          ? "Video"
                          : "In-person"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(data.stats.nextAppointment.appointmentDate)} at{" "}
                      {data.stats.nextAppointment.startTime.slice(0, 5)}
                      {data.stats.nextAppointment.hospitalName
                        ? ` · ${data.stats.nextAppointment.hospitalName}`
                        : ""}
                    </p>
                  </div>
                  <Button variant="outline" asChild>
                    <Link
                      to="/doctor/appointments/$id"
                      params={{ id: data.stats.nextAppointment.id }}
                    >
                      View details
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="No upcoming appointments"
                description="Your schedule is clear."
              />
            )}
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
