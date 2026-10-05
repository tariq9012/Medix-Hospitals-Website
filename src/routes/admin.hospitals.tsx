import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { DataTable, type Column } from "@/components/common/DataTable";
import { PageHeader, Pagination, StatusBadge } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listAdminHospitalsFn } from "@/lib/admin/functions";
import { formatStatusLabel } from "@/lib/appointments/status";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

const ALL = "ALL";

const searchSchema = z.object({
  verification: z.enum(["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]).optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
});

export const Route = createFileRoute("/admin/hospitals")({
  beforeLoad: requireRoleBeforeLoad("ADMIN"),
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    listAdminHospitalsFn({
      data: {
        verificationStatus: deps.verification,
        search: deps.q,
        page: deps.page ?? 1,
        pageSize: 20,
      },
    }),
  head: () => ({
    meta: [
      { title: "Hospitals — Medix" },
      { name: "description", content: "All hospitals on the platform." },
    ],
  }),
  component: AdminHospitals,
});

function AdminHospitals() {
  const { user } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const result = Route.useLoaderData();
  const [query, setQuery] = useState(search.q ?? "");

  type Row = (typeof result.items)[number];

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Hospital",
      render: (h) => <span className="font-medium">{h.name}</span>,
    },
    { key: "city", header: "City", render: (h) => h.city ?? "—" },
    { key: "phone", header: "Phone", render: (h) => h.phone ?? "—", hideOnCard: true },
    {
      key: "verification",
      header: "Verification",
      render: (h) => <StatusBadge status={formatStatusLabel(h.verificationStatus)} />,
    },
    {
      key: "actions",
      header: "",
      render: (h) => (
        <Button size="sm" variant="outline" asChild>
          <Link to="/admin/hospital-verification/$id" params={{ id: h.id }}>
            Review
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <DashboardLayout
      role="admin"
      user={{ name: user.displayName, subtitle: "Platform operations" }}
    >
      <PageHeader title="Hospitals" description="Every hospital registered on Medix." />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <form
          className="relative sm:w-64"
          onSubmit={(e) => {
            e.preventDefault();
            navigate({
              to: "/admin/hospitals",
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
            placeholder="Search hospital name…"
            className="pl-9"
          />
        </form>

        <Select
          value={search.verification ?? ALL}
          onValueChange={(v) =>
            navigate({
              to: "/admin/hospitals",
              search: { ...search, verification: v === ALL ? undefined : (v as never), page: 1 },
            })
          }
        >
          <SelectTrigger className="sm:w-52">
            <SelectValue placeholder="All verification states" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All verification states</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
            <SelectItem value="SUSPENDED">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable columns={columns} rows={result.items} emptyTitle="No hospitals found" />

      {result.totalPages > 1 && (
        <div className="mt-5">
          <Pagination
            page={result.page}
            totalPages={result.totalPages}
            onChange={(page) => navigate({ to: "/admin/hospitals", search: { ...search, page } })}
          />
        </div>
      )}
    </DashboardLayout>
  );
}
