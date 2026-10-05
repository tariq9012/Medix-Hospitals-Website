import { createFileRoute, Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { DataTable, type Column } from "@/components/common/DataTable";
import { PageHeader, StatusBadge } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DoctorAppointmentRow } from "@/lib/doctor/queries.server";
import { listDoctorAppointmentsFn } from "@/lib/doctor/functions";
import { formatStatusLabel } from "@/lib/appointments/status";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

export const Route = createFileRoute("/doctor/appointments/")({
  beforeLoad: requireRoleBeforeLoad("DOCTOR"),
  loader: () => listDoctorAppointmentsFn(),
  head: () => ({
    meta: [
      { title: "Appointments — Medix" },
      { name: "description", content: "Your upcoming and past patient appointments." },
    ],
  }),
  component: DoctorAppointments,
});

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const TABS = ["all", "today", "pending", "confirmed", "completed", "cancelled"] as const;
type Tab = (typeof TABS)[number];

function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function DoctorAppointments() {
  const { user } = Route.useRouteContext();
  const appointments = Route.useLoaderData();
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");

  const today = todayLocal();

  const filtered = useMemo(() => {
    let rows = appointments;
    if (tab === "today") rows = rows.filter((a) => a.appointmentDate === today);
    else if (tab === "pending") rows = rows.filter((a) => a.status === "PENDING");
    else if (tab === "confirmed") rows = rows.filter((a) => a.status === "CONFIRMED");
    else if (tab === "completed") rows = rows.filter((a) => a.status === "COMPLETED");
    else if (tab === "cancelled")
      rows = rows.filter((a) => a.status === "CANCELLED" || a.status === "NO_SHOW");

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      rows = rows.filter((a) =>
        `${a.patientFirstName} ${a.patientLastName}`.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [appointments, tab, query, today]);

  const columns: Column<DoctorAppointmentRow>[] = [
    {
      key: "patient",
      header: "Patient",
      render: (a) => (
        <span className="font-medium">
          {a.patientFirstName} {a.patientLastName}
        </span>
      ),
    },
    {
      key: "date",
      header: "Date & time",
      render: (a) => (
        <span>
          {formatDate(a.appointmentDate)} · {a.startTime.slice(0, 5)}
        </span>
      ),
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
      key: "actions",
      header: "",
      render: (a) => (
        <Button variant="outline" size="sm" asChild>
          <Link to="/doctor/appointments/$id" params={{ id: a.id }}>
            View
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <DashboardLayout role="doctor" user={{ name: user.displayName, subtitle: "Doctor account" }}>
      <PageHeader title="Appointments" description="Everything booked with you, in one place." />

      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList className="flex-wrap">
            {TABS.map((t) => (
              <TabsTrigger key={t} value={t} className="capitalize">
                {t}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative sm:w-64">
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search patient name…"
            className="pl-9"
          />
        </div>
      </div>

      {!appointments ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={filtered}
          emptyTitle="No appointments"
          emptyDescription="Nothing matches this filter yet."
        />
      )}
    </DashboardLayout>
  );
}
