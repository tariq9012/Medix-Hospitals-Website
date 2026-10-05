import { createFileRoute } from "@tanstack/react-router";

import { DataTable, type Column } from "@/components/common/DataTable";
import { PageHeader } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatStatusLabel } from "@/lib/appointments/status";
import { listHospitalSchedulesFn } from "@/lib/hospital/functions";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

export const Route = createFileRoute("/hospital/schedules")({
  beforeLoad: requireRoleBeforeLoad("HOSPITAL_ADMIN"),
  loader: () => listHospitalSchedulesFn(),
  head: () => ({
    meta: [
      { title: "Schedules — Medix" },
      { name: "description", content: "Doctor availability at your hospital." },
    ],
  }),
  component: HospitalSchedules,
});

function HospitalSchedules() {
  const { user } = Route.useRouteContext();
  const schedules = Route.useLoaderData();

  type Row = (typeof schedules)[number];

  const columns: Column<Row>[] = [
    {
      key: "doctor",
      header: "Doctor",
      render: (s) => (
        <span className="font-medium">
          Dr. {s.doctorFirstName} {s.doctorLastName}
        </span>
      ),
    },
    { key: "day", header: "Day", render: (s) => formatStatusLabel(s.dayOfWeek) },
    {
      key: "time",
      header: "Hours",
      render: (s) => `${s.startTime.slice(0, 5)} – ${s.endTime.slice(0, 5)}`,
    },
    {
      key: "slot",
      header: "Slot",
      render: (s) => `${s.slotDurationMinutes} min`,
      hideOnCard: true,
    },
    {
      key: "type",
      header: "Type",
      render: (s) => (s.consultationType === "ONLINE" ? "Video" : "In-person"),
      hideOnCard: true,
    },
    {
      key: "status",
      header: "Status",
      render: (s) =>
        s.isActive ? (
          <Badge variant="secondary">Active</Badge>
        ) : (
          <Badge variant="outline">Paused</Badge>
        ),
    },
  ];

  return (
    <DashboardLayout role="hospital" user={{ name: user.displayName, subtitle: "Hospital admin" }}>
      <PageHeader
        title="Schedules"
        description="When your affiliated doctors are available at this hospital."
      />

      <Card className="mb-5 border-primary/20 bg-primary-soft/40">
        <CardContent className="p-4 text-sm text-muted-foreground">
          This is a read-only view of the same availability doctors manage themselves — there's no
          separate hospital schedule. To change a doctor's hours, the doctor updates them in their
          own portal.
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        rows={schedules}
        emptyTitle="No schedules yet"
        emptyDescription="Affiliated doctors' availability at this hospital will appear here."
      />
    </DashboardLayout>
  );
}
