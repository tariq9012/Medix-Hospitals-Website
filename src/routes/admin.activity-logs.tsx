import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { DataTable, type Column } from "@/components/common/DataTable";
import { PageHeader, Pagination } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listAdminAuditLogsFn } from "@/lib/admin/functions";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

const ALL = "ALL";

const searchSchema = z.object({
  action: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
});

export const Route = createFileRoute("/admin/activity-logs")({
  beforeLoad: requireRoleBeforeLoad("ADMIN"),
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    listAdminAuditLogsFn({
      data: {
        action: deps.action,
        fromDate: deps.from,
        toDate: deps.to,
        page: deps.page ?? 1,
        pageSize: 25,
      },
    }),
  head: () => ({
    meta: [
      { title: "Activity Logs — Medix" },
      { name: "description", content: "An audit trail of sensitive platform actions." },
    ],
  }),
  component: AdminActivityLogs,
});

function formatDateTime(value: Date | string): string {
  return new Date(value).toLocaleString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AdminActivityLogs() {
  const { user } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const result = Route.useLoaderData();

  type Row = (typeof result.items)[number];

  function updateSearch(patch: Partial<typeof search>) {
    navigate({ to: "/admin/activity-logs", search: { ...search, ...patch, page: 1 } });
  }

  const columns: Column<Row>[] = [
    { key: "time", header: "When", render: (l) => formatDateTime(l.createdAt) },
    {
      key: "action",
      header: "Action",
      render: (l) => (
        <Badge variant="secondary" className="font-mono text-[11px]">
          {l.action}
        </Badge>
      ),
    },
    { key: "actor", header: "Actor", render: (l) => l.actorEmail ?? "System" },
    {
      key: "entity",
      header: "Entity",
      render: (l) => (
        <span className="text-xs text-muted-foreground">
          {l.entityType}
          {l.entityId ? ` · ${l.entityId.slice(0, 8)}` : ""}
        </span>
      ),
      hideOnCard: true,
    },
    {
      key: "metadata",
      header: "Details",
      render: (l) =>
        l.metadata ? (
          <span className="font-mono text-[11px] text-muted-foreground">
            {JSON.stringify(l.metadata).slice(0, 80)}
          </span>
        ) : (
          "—"
        ),
      hideOnCard: true,
    },
  ];

  return (
    <DashboardLayout
      role="admin"
      user={{ name: user.displayName, subtitle: "Platform operations" }}
    >
      <PageHeader
        title="Activity logs"
        description="A permanent trail of sensitive actions across Medix. Secrets are never recorded here."
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="space-y-1.5 sm:w-64">
          <Label>Action</Label>
          <Select
            value={search.action ?? ALL}
            onValueChange={(v) => updateSearch({ action: v === ALL ? undefined : v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All actions</SelectItem>
              {result.availableActions.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="from">From</Label>
          <Input
            id="from"
            type="date"
            value={search.from ?? ""}
            onChange={(e) => updateSearch({ from: e.target.value || undefined })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to">To</Label>
          <Input
            id="to"
            type="date"
            value={search.to ?? ""}
            onChange={(e) => updateSearch({ to: e.target.value || undefined })}
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={result.items}
        emptyTitle="No activity found"
        emptyDescription="Try widening the filters."
      />

      {result.totalPages > 1 && (
        <div className="mt-5">
          <Pagination
            page={result.page}
            totalPages={result.totalPages}
            onChange={(page) =>
              navigate({ to: "/admin/activity-logs", search: { ...search, page } })
            }
          />
        </div>
      )}
    </DashboardLayout>
  );
}
