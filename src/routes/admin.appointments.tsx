import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { DataTable, type Column } from "@/components/common/DataTable";
import { PageHeader, Pagination, StatusBadge } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listAdminAppointmentsFn } from "@/lib/admin/functions";
import { formatStatusLabel } from "@/lib/appointments/status";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

const ALL = "ALL";

const searchSchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
});

export const Route = createFileRoute("/admin/appointments")({
  beforeLoad: requireRoleBeforeLoad("ADMIN"),
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    listAdminAppointmentsFn({ data: { status: deps.status, page: deps.page ?? 1, pageSize: 20 } }),
  head: () => ({
    meta: [
      { title: "Appointments — Medix" },
      { name: "description", content: "All appointments across the platform." },
    ],
  }),
  component: AdminAppointments,
});

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function AdminAppointments() {
  const { user } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const result = Route.useLoaderData();

  type Row = (typeof result.items)[number];

  const columns: Column<Row>[] = [
    {
      key: "date",
      header: "When",
      render: (a) => (
        <span className="font-medium">
          {formatDate(a.appointmentDate)} · {a.startTime.slice(0, 5)}
        </span>
      ),
    },
    { key: "patient", header: "Patient", render: (a) => a.patientEmail },
    {
      key: "doctor",
      header: "Doctor",
      render: (a) => `Dr. ${a.doctorFirstName} ${a.doctorLastName}`,
    },
    {
      key: "hospital",
      header: "Location",
      render: (a) => a.hospitalName ?? "Online",
      hideOnCard: true,
    },
    {
      key: "status",
      header: "Status",
      render: (a) => <StatusBadge status={formatStatusLabel(a.status)} />,
    },
    {
      key: "payment",
      header: "Payment",
      render: (a) => <StatusBadge status={formatStatusLabel(a.paymentStatus)} />,
      hideOnCard: true,
    },
  ];

  return (
    <DashboardLayout
      role="admin"
      user={{ name: user.displayName, subtitle: "Platform operations" }}
    >
      <PageHeader title="Appointments" description="Platform-wide scheduling oversight." />

      <Card className="mb-5 border-primary/20 bg-primary-soft/40">
        <CardContent className="p-4 text-sm text-muted-foreground">
          This view is read-only. Clinical outcomes (confirming, completing, marking no-show) are
          recorded by the treating doctor, and cancellations by the patient or doctor — an admin
          doesn't set them here. Reason-for-visit and patient notes are deliberately not shown.
        </CardContent>
      </Card>

      <div className="mb-5 sm:w-52">
        <Select
          value={search.status ?? ALL}
          onValueChange={(v) =>
            navigate({
              to: "/admin/appointments",
              search: { status: v === ALL ? undefined : (v as never), page: 1 },
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="CONFIRMED">Confirmed</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
            <SelectItem value="NO_SHOW">No show</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable columns={columns} rows={result.items} emptyTitle="No appointments found" />

      {result.totalPages > 1 && (
        <div className="mt-5">
          <Pagination
            page={result.page}
            totalPages={result.totalPages}
            onChange={(page) =>
              navigate({ to: "/admin/appointments", search: { ...search, page } })
            }
          />
        </div>
      )}
    </DashboardLayout>
  );
}
