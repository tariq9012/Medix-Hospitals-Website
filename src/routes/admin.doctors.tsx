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
import { listAdminDoctorsFn } from "@/lib/admin/functions";
import { formatStatusLabel } from "@/lib/appointments/status";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

const ALL = "ALL";

const searchSchema = z.object({
  verification: z.enum(["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]).optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
});

export const Route = createFileRoute("/admin/doctors")({
  beforeLoad: requireRoleBeforeLoad("ADMIN"),
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    listAdminDoctorsFn({
      data: {
        verificationStatus: deps.verification,
        search: deps.q,
        page: deps.page ?? 1,
        pageSize: 20,
      },
    }),
  head: () => ({
    meta: [
      { title: "Doctors — Medix" },
      { name: "description", content: "All doctors on the platform." },
    ],
  }),
  component: AdminDoctors,
});

function AdminDoctors() {
  const { user } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const result = Route.useLoaderData();
  const [query, setQuery] = useState(search.q ?? "");

  type Row = (typeof result.items)[number];

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Doctor",
      render: (d) => (
        <span className="font-medium">
          Dr. {d.firstName} {d.lastName}
        </span>
      ),
    },
    { key: "email", header: "Email", render: (d) => d.email },
    {
      key: "verification",
      header: "Verification",
      render: (d) => <StatusBadge status={formatStatusLabel(d.verificationStatus)} />,
    },
    {
      key: "account",
      header: "Account",
      render: (d) => <StatusBadge status={formatStatusLabel(d.accountStatus)} />,
      hideOnCard: true,
    },
    {
      key: "available",
      header: "Available",
      render: (d) => (d.isAvailable ? "Yes" : "No"),
      hideOnCard: true,
    },
    {
      key: "actions",
      header: "",
      render: (d) => (
        <Button size="sm" variant="outline" asChild>
          <Link to="/admin/doctor-verification/$id" params={{ id: d.id }}>
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
      <PageHeader title="Doctors" description="Every doctor registered on Medix." />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <form
          className="relative sm:w-64"
          onSubmit={(e) => {
            e.preventDefault();
            navigate({
              to: "/admin/doctors",
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
            placeholder="Search name or email…"
            className="pl-9"
          />
        </form>

        <Select
          value={search.verification ?? ALL}
          onValueChange={(v) =>
            navigate({
              to: "/admin/doctors",
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

      <DataTable columns={columns} rows={result.items} emptyTitle="No doctors found" />

      {result.totalPages > 1 && (
        <div className="mt-5">
          <Pagination
            page={result.page}
            totalPages={result.totalPages}
            onChange={(page) => navigate({ to: "/admin/doctors", search: { ...search, page } })}
          />
        </div>
      )}
    </DashboardLayout>
  );
}
