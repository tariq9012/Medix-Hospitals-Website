import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { DataTable, type Column } from "@/components/common/DataTable";
import { PageHeader, Pagination } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listHospitalPatientsFn } from "@/lib/hospital/functions";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

const searchSchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
});

export const Route = createFileRoute("/hospital/patients")({
  beforeLoad: requireRoleBeforeLoad("HOSPITAL_ADMIN"),
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    listHospitalPatientsFn({ data: { search: deps.q, page: deps.page ?? 1, pageSize: 20 } }),
  head: () => ({
    meta: [
      { title: "Patients — Medix" },
      { name: "description", content: "Patients treated at your hospital." },
    ],
  }),
  component: HospitalPatients,
});

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function calculateAge(dob: string | null): string {
  if (!dob) return "—";
  const birth = new Date(`${dob}T00:00:00`);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const hadBirthday =
    now.getMonth() > birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!hadBirthday) age -= 1;
  return `${age}`;
}

function HospitalPatients() {
  const { user } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const result = Route.useLoaderData();
  const [query, setQuery] = useState(search.q ?? "");

  const rows = result.items.map((p) => ({ ...p, id: p.patientId }));
  type Row = (typeof rows)[number];

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Patient",
      render: (p) => (
        <span className="font-medium">
          {p.firstName ?? "Unknown"} {p.lastName ?? ""}
        </span>
      ),
    },
    {
      key: "gender",
      header: "Gender",
      render: (p) => (p.gender ? p.gender.charAt(0) + p.gender.slice(1).toLowerCase() : "—"),
      hideOnCard: true,
    },
    { key: "age", header: "Age", render: (p) => calculateAge(p.dateOfBirth), hideOnCard: true },
    { key: "visits", header: "Visits here", render: (p) => String(p.totalAppointments) },
    { key: "last", header: "Last visit", render: (p) => formatDate(p.lastVisit) },
  ];

  return (
    <DashboardLayout role="hospital" user={{ name: user.displayName, subtitle: "Hospital admin" }}>
      <PageHeader
        title="Patients"
        description="Patients who have had an appointment at your hospital."
      />

      <Card className="mb-5 border-primary/20 bg-primary-soft/40">
        <CardContent className="p-4 text-sm text-muted-foreground">
          This list is built from your hospital's own appointments — it isn't a platform-wide
          patient directory. Clinical history stays with the treating doctor.
        </CardContent>
      </Card>

      <form
        className="relative mb-5 sm:w-64"
        onSubmit={(e) => {
          e.preventDefault();
          navigate({ to: "/hospital/patients", search: { q: query || undefined, page: 1 } });
        }}
      >
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
      </form>

      <DataTable
        columns={columns}
        rows={rows}
        emptyTitle="No patients yet"
        emptyDescription="Patients appear here once they've booked at your hospital."
      />

      {result.totalPages > 1 && (
        <div className="mt-5">
          <Pagination
            page={result.page}
            totalPages={result.totalPages}
            onChange={(page) => navigate({ to: "/hospital/patients", search: { ...search, page } })}
          />
        </div>
      )}
    </DashboardLayout>
  );
}
