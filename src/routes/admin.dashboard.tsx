import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Building2,
  CalendarCheck,
  CalendarDays,
  ShieldCheck,
  Stethoscope,
  Users,
  XCircle,
} from "lucide-react";

import { PageHeader, SectionHeading, StatCard, StatusBadge } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAdminDashboardFn } from "@/lib/admin/functions";
import { formatStatusLabel } from "@/lib/appointments/status";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

export const Route = createFileRoute("/admin/dashboard")({
  beforeLoad: requireRoleBeforeLoad("ADMIN"),
  loader: () => getAdminDashboardFn(),
  head: () => ({
    meta: [
      { title: "Admin Dashboard — Medix" },
      { name: "description", content: "A platform-wide overview." },
    ],
  }),
  component: AdminDashboard,
});

function formatDateTime(value: Date | string): string {
  return new Date(value).toLocaleString("en-US", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AdminDashboard() {
  const { user } = Route.useRouteContext();
  const { stats, recentRegistrations, recentVerifications } = Route.useLoaderData();

  const needsAttention = stats.pendingDoctors + stats.pendingHospitals;

  return (
    <DashboardLayout
      role="admin"
      user={{ name: user.displayName, subtitle: "Platform operations" }}
    >
      <PageHeader title="Admin dashboard" description="A live overview of the Medix platform." />

      {needsAttention > 0 && (
        <Card className="mb-6 border-warning/40 bg-warning/10">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-start gap-3 text-sm">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
              <p>
                <strong>{needsAttention}</strong> provider{needsAttention === 1 ? "" : "s"} awaiting
                verification review.
              </p>
            </div>
            <div className="flex gap-2">
              {stats.pendingDoctors > 0 && (
                <Button size="sm" variant="outline" asChild>
                  <Link to="/admin/doctor-verification">Review doctors</Link>
                </Button>
              )}
              {stats.pendingHospitals > 0 && (
                <Button size="sm" variant="outline" asChild>
                  <Link to="/admin/hospital-verification">Review hospitals</Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total users" value={stats.totalUsers} icon={Users} />
        <StatCard label="Patients" value={stats.totalPatients} icon={Users} tone="accent" />
        <StatCard label="Doctors" value={stats.totalDoctors} icon={Stethoscope} />
        <StatCard label="Hospitals" value={stats.totalHospitals} icon={Building2} />
        <StatCard
          label="Verified doctors"
          value={stats.verifiedDoctors}
          icon={ShieldCheck}
          tone="success"
        />
        <StatCard
          label="Pending doctors"
          value={stats.pendingDoctors}
          icon={ShieldCheck}
          tone="warning"
        />
        <StatCard
          label="Verified hospitals"
          value={stats.verifiedHospitals}
          icon={ShieldCheck}
          tone="success"
        />
        <StatCard
          label="Pending hospitals"
          value={stats.pendingHospitals}
          icon={ShieldCheck}
          tone="warning"
        />
        <StatCard label="Total appointments" value={stats.totalAppointments} icon={CalendarDays} />
        <StatCard label="Today" value={stats.appointmentsToday} icon={CalendarDays} tone="accent" />
        <StatCard
          label="Completed"
          value={stats.completedAppointments}
          icon={CalendarCheck}
          tone="success"
        />
        <StatCard
          label="Cancelled"
          value={stats.cancelledAppointments}
          icon={XCircle}
          tone="warning"
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <SectionHeading
            title="Recent registrations"
            action={
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/users">View all</Link>
              </Button>
            }
          />
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {recentRegistrations.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No registrations yet.</p>
              ) : (
                recentRegistrations.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.email}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <StatusBadge status={formatStatusLabel(r.role)} />
                      <StatusBadge status={formatStatusLabel(r.status)} />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>

        <section>
          <SectionHeading
            title="Recent verification decisions"
            action={
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/activity-logs">Activity log</Link>
              </Button>
            }
          />
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {recentVerifications.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No decisions recorded yet.</p>
              ) : (
                recentVerifications.map((v) => (
                  <div key={v.id} className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {formatStatusLabel(v.providerType)} · {formatStatusLabel(v.previousStatus)}{" "}
                        → {formatStatusLabel(v.newStatus)}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(v.createdAt)}</p>
                    </div>
                    <StatusBadge status={formatStatusLabel(v.newStatus)} />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </DashboardLayout>
  );
}
