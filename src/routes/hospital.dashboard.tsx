import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  Clock,
  Layers,
  Stethoscope,
  Users,
} from "lucide-react";

import { PageHeader, SectionHeading, StatCard } from "@/components/common";
import { HospitalPendingNotice } from "@/components/hospital/HospitalPendingNotice";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { getHospitalDashboardFn } from "@/lib/hospital/functions";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

export const Route = createFileRoute("/hospital/dashboard")({
  beforeLoad: requireRoleBeforeLoad("HOSPITAL_ADMIN"),
  loader: () => getHospitalDashboardFn(),
  head: () => ({
    meta: [
      { title: "Hospital Dashboard — Medix" },
      { name: "description", content: "An overview of hospital activity." },
    ],
  }),
  component: HospitalDashboard,
});

function HospitalDashboard() {
  const { user } = Route.useRouteContext();
  const { hospital, isOperational, stats } = Route.useLoaderData();

  return (
    <DashboardLayout role="hospital" user={{ name: user.displayName, subtitle: hospital.name }}>
      <PageHeader title={hospital.name} description="A live overview of your hospital." />

      {!isOperational || !stats ? (
        <HospitalPendingNotice
          status={hospital.verificationStatus}
          reason={hospital.verificationReason}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Affiliated doctors"
              value={stats.affiliatedDoctors}
              icon={Stethoscope}
            />
            <StatCard
              label="Verified doctors"
              value={stats.verifiedDoctors}
              icon={Stethoscope}
              tone="success"
            />
            <StatCard
              label="Appointments today"
              value={stats.appointmentsToday}
              icon={CalendarDays}
            />
            <StatCard
              label="Upcoming"
              value={stats.upcomingAppointments}
              icon={CalendarClock}
              tone="accent"
            />
            <StatCard
              label="Pending confirmation"
              value={stats.pendingAppointments}
              icon={Clock}
              tone="warning"
            />
            <StatCard
              label="Completed"
              value={stats.completedAppointments}
              icon={CalendarCheck}
              tone="success"
            />
            <StatCard label="Patients seen" value={stats.uniquePatients} icon={Users} />
            <StatCard label="Departments" value={stats.departments} icon={Layers} tone="accent" />
          </div>

          <div className="mt-8">
            <SectionHeading title="Quick actions" />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link to="/hospital/appointments">View appointments</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/hospital/doctors">Manage doctors</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/hospital/departments">Departments</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/hospital/services">Services</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/hospital/schedules">Schedules</Link>
              </Button>
            </div>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
