import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { DataTable, type Column } from "@/components/common/DataTable";
import { PageHeader, Pagination, StatusBadge } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatStatusLabel } from "@/lib/appointments/status";
import { listHospitalAppointmentsFn } from "@/lib/hospital/functions";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

const TABS = [
  "ALL",
  "TODAY",
  "UPCOMING",
  "PENDING",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
] as const;

const searchSchema = z.object({
  tab: z.enum(TABS).optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
});

export const Route = createFileRoute("/hospital/appointments")({
  beforeLoad: requireRoleBeforeLoad("HOSPITAL_ADMIN"),
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => {
    const tab = deps.tab ?? "ALL";
    const scope = tab === "TODAY" || tab === "UPCOMING" ? tab : "ALL";
    const status =
      tab === "PENDING" || tab === "CONFIRMED" || tab === "COMPLETED" || tab === "CANCELLED"
        ? tab
        : undefined;
    return listHospitalAppointmentsFn({
      data: { scope, status, search: deps.q, page: deps.page ?? 1, pageSize: 20 },
    });
  },
  head: () => ({
    meta: [
      { title: "Appointments — Medix" },
      { name: "description", content: "Appointments across your hospital." },
    ],
  }),
  component: HospitalAppointments,
});

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

function HospitalAppointments() {
  const { user } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const result = Route.useLoaderData();
  const [query, setQuery] = useState(search.q ?? "");
  const activeTab = search.tab ?? "ALL";

  type Row = (typeof result.items)[number];

  const columns: Column<Row>[] = [
    {
      key: "when",
      header: "When",
      render: (a) => (
        <span className="font-medium">
          {formatDate(a.appointmentDate)} · {a.startTime.slice(0, 5)}
        </span>
      ),
    },
    {
      key: "patient",
      header: "Patient",
      render: (a) => `${a.patientFirstName ?? "Unknown"} ${a.patientLastName ?? ""}`.trim(),
    },
    {
      key: "doctor",
      header: "Doctor",
      render: (a) => `Dr. ${a.doctorFirstName} ${a.doctorLastName}`,
    },
    {
      key: "type",
      header: "Type",
      render: (a) => (a.consultationType === "ONLINE" ? "Video" : "In-person"),
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
    { key: "fee", header: "Fee", render: (a) => formatFee(a.fee), hideOnCard: true },
  ];

  return (
    <DashboardLayout role="hospital" user={{ name: user.displayName, subtitle: "Hospital admin" }}>
      <PageHeader title="Appointments" description="Everything booked at your hospital." />

      <Card className="mb-5 border-primary/20 bg-primary-soft/40">
        <CardContent className="p-4 text-sm text-muted-foreground">
          This view is read-only. Confirming, completing, and cancelling appointments stays with the
          treating doctor and the patient — reason-for-visit and clinical notes aren't shown here.
        </CardContent>
      </Card>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={activeTab}
          onValueChange={(v) =>
            navigate({
              to: "/hospital/appointments",
              search: { ...search, tab: v as never, page: 1 },
            })
          }
        >
          <TabsList className="flex-wrap">
            {TABS.map((t) => (
              <TabsTrigger key={t} value={t}>
                {formatStatusLabel(t)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <form
          className="relative sm:w-64"
          onSubmit={(e) => {
            e.preventDefault();
            navigate({
              to: "/hospital/appointments",
              search: { ...search, q: query || undefined, page: 1 },
            });
          }}
        >
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search patient or doctor…"
            className="pl-9"
          />
        </form>
      </div>

      <DataTable
        columns={columns}
        rows={result.items}
        emptyTitle="No appointments"
        emptyDescription="Nothing matches this filter yet."
      />

      {result.totalPages > 1 && (
        <div className="mt-5">
          <Pagination
            page={result.page}
            totalPages={result.totalPages}
            onChange={(page) =>
              navigate({ to: "/hospital/appointments", search: { ...search, page } })
            }
          />
        </div>
      )}
    </DashboardLayout>
  );
}
