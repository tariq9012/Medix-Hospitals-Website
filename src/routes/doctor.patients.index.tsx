import { createFileRoute, Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { DataTable, type Column } from "@/components/common/DataTable";
import { PageHeader } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DoctorPatientSummary } from "@/lib/doctor/queries.server";
import { listDoctorPatientsFn } from "@/lib/doctor/functions";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

export const Route = createFileRoute("/doctor/patients/")({
  beforeLoad: requireRoleBeforeLoad("DOCTOR"),
  loader: () => listDoctorPatientsFn(),
  head: () => ({
    meta: [
      { title: "Patients — Medix" },
      { name: "description", content: "The patients under your care." },
    ],
  }),
  component: DoctorPatients,
});

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function DoctorPatients() {
  const { user } = Route.useRouteContext();
  const patients = Route.useLoaderData();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return patients;
    const q = query.trim().toLowerCase();
    return patients.filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q));
  }, [patients, query]);

  const columns: Column<DoctorPatientSummary & { id: string }>[] = [
    {
      key: "name",
      header: "Patient",
      render: (p) => (
        <span className="font-medium">
          {p.firstName} {p.lastName}
        </span>
      ),
    },
    { key: "total", header: "Appointments", render: (p) => String(p.totalAppointments) },
    {
      key: "last",
      header: "Last visit",
      render: (p) => formatDate(p.lastAppointmentDate),
      hideOnCard: true,
    },
    {
      key: "next",
      header: "Next visit",
      render: (p) => formatDate(p.nextAppointmentDate),
      hideOnCard: true,
    },
    {
      key: "actions",
      header: "",
      render: (p) => (
        <Button variant="outline" size="sm" asChild>
          <Link to="/doctor/patients/$id" params={{ id: p.patientId }}>
            View
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <DashboardLayout role="doctor" user={{ name: user.displayName, subtitle: "Doctor account" }}>
      <PageHeader
        title="Patients"
        description="Everyone who has an appointment relationship with you."
      />

      <div className="relative mb-5 sm:w-72">
        <Search
          className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search patients…"
          className="pl-9"
        />
      </div>

      <DataTable
        columns={columns}
        rows={filtered.map((p) => ({ ...p, id: p.patientId }))}
        emptyTitle="No patients yet"
        emptyDescription="Patients appear here once they book an appointment with you."
      />
    </DashboardLayout>
  );
}
