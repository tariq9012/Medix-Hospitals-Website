import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { DataTable, type Column } from "@/components/common/DataTable";
import { PageHeader, Pagination, StatusBadge } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listAdminDoctorsFn } from "@/lib/admin/functions";
import { formatStatusLabel } from "@/lib/appointments/status";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";
import type { VerificationStatus } from "@/lib/validation/enums";

const searchSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "SUSPENDED"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
});

export const Route = createFileRoute("/admin/doctor-verification/")({
  beforeLoad: requireRoleBeforeLoad("ADMIN"),
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ status: search.status, page: search.page }),
  // Pending first by default — that's the queue that needs action, not an
  // evaluative ranking of the doctors themselves.
  loader: ({ deps }) =>
    listAdminDoctorsFn({
      data: { verificationStatus: deps.status ?? "PENDING", page: deps.page ?? 1, pageSize: 20 },
    }),
  head: () => ({
    meta: [
      { title: "Doctor Verification — Medix" },
      { name: "description", content: "Review and approve doctor verification requests." },
    ],
  }),
  component: DoctorVerificationQueue,
});

const TABS: VerificationStatus[] = ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"];

function DoctorVerificationQueue() {
  const { user } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const result = Route.useLoaderData();
  const activeStatus = search.status ?? "PENDING";

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
      key: "license",
      header: "License",
      render: (d) => d.medicalLicenseNumber ?? "—",
      hideOnCard: true,
    },
    {
      key: "experience",
      header: "Experience",
      render: (d) => (d.yearsOfExperience != null ? `${d.yearsOfExperience} yrs` : "—"),
      hideOnCard: true,
    },
    {
      key: "status",
      header: "Verification",
      render: (d) => <StatusBadge status={formatStatusLabel(d.verificationStatus)} />,
    },
    {
      key: "actions",
      header: "",
      render: (d) => (
        <Button size="sm" asChild>
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
      <PageHeader
        title="Doctor verification"
        description="Review provider applications and decide whether they can practise on Medix."
      />

      <Tabs
        value={activeStatus}
        onValueChange={(v) =>
          navigate({
            to: "/admin/doctor-verification",
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
        emptyTitle={`No ${formatStatusLabel(activeStatus).toLowerCase()} doctors`}
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
              navigate({ to: "/admin/doctor-verification", search: { status: activeStatus, page } })
            }
          />
        </div>
      )}
    </DashboardLayout>
  );
}
