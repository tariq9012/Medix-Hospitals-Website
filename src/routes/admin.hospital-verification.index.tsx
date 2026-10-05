import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { DataTable, type Column } from "@/components/common/DataTable";
import { PageHeader, Pagination, StatusBadge } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listAdminHospitalsFn } from "@/lib/admin/functions";
import { formatStatusLabel } from "@/lib/appointments/status";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";
import type { VerificationStatus } from "@/lib/validation/enums";

const searchSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
});

export const Route = createFileRoute("/admin/hospital-verification/")({
  beforeLoad: requireRoleBeforeLoad("ADMIN"),
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ status: search.status, page: search.page }),
  loader: ({ deps }) =>
    listAdminHospitalsFn({
      data: { verificationStatus: deps.status ?? "PENDING", page: deps.page ?? 1, pageSize: 20 },
    }),
  head: () => ({
    meta: [
      { title: "Hospital Verification — Medix" },
      { name: "description", content: "Review and approve hospital verification requests." },
    ],
  }),
  component: HospitalVerificationQueue,
});

const TABS: VerificationStatus[] = ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"];

function HospitalVerificationQueue() {
  const { user } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const result = Route.useLoaderData();
  const activeStatus = search.status ?? "PENDING";

  type Row = (typeof result.items)[number];

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Hospital",
      render: (h) => <span className="font-medium">{h.name}</span>,
    },
    { key: "city", header: "City", render: (h) => h.city ?? "—" },
    { key: "email", header: "Email", render: (h) => h.email ?? "—", hideOnCard: true },
    { key: "phone", header: "Phone", render: (h) => h.phone ?? "—", hideOnCard: true },
    {
      key: "status",
      header: "Verification",
      render: (h) => <StatusBadge status={formatStatusLabel(h.verificationStatus)} />,
    },
    {
      key: "actions",
      header: "",
      render: (h) => (
        <Button size="sm" asChild>
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
      <PageHeader
        title="Hospital verification"
        description="Review hospital applications and decide whether they can operate on Medix."
      />

      <Tabs
        value={activeStatus}
        onValueChange={(v) =>
          navigate({
            to: "/admin/hospital-verification",
            search: { status: v as VerificationStatus, page: 1 },
          })
        }
        className="mb-5"
      >
        <TabsList className="flex-wrap">
          {TABS.map((t) => (
            <TabsTrigger key={t} value={t}>
              {formatStatusLabel(t)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <DataTable
        columns={columns}
        rows={result.items}
        emptyTitle={`No ${formatStatusLabel(activeStatus).toLowerCase()} hospitals`}
        emptyDescription={
          activeStatus === "PENDING"
            ? "Nothing is waiting for review right now."
            : "Nothing to show in this tab."
        }
      />

      {result.totalPages > 1 && (
        <div className="mt-5">
          <Pagination
            page={result.page}
            totalPages={result.totalPages}
            onChange={(page) =>
              navigate({
                to: "/admin/hospital-verification",
                search: { status: activeStatus, page },
              })
            }
          />
        </div>
      )}
    </DashboardLayout>
  );
}
