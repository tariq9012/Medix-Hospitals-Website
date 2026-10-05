import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { AdminConfirmDialog } from "@/components/admin/AdminConfirmDialog";
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
import { listAdminUsersFn, updateUserStatusFn } from "@/lib/admin/functions";
import { formatStatusLabel } from "@/lib/appointments/status";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

const ALL = "ALL";

const searchSchema = z.object({
  role: z.enum(["PATIENT", "DOCTOR", "HOSPITAL_ADMIN", "ADMIN"]).optional(),
  status: z.enum(["ACTIVE", "PENDING_VERIFICATION", "SUSPENDED", "DEACTIVATED"]).optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
});

export const Route = createFileRoute("/admin/users")({
  beforeLoad: requireRoleBeforeLoad("ADMIN"),
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    listAdminUsersFn({
      data: {
        role: deps.role,
        status: deps.status,
        search: deps.q,
        page: deps.page ?? 1,
        pageSize: 20,
      },
    }),
  head: () => ({
    meta: [
      { title: "Users — Medix" },
      { name: "description", content: "Manage platform user accounts." },
    ],
  }),
  component: AdminUsers,
});

function formatDateTime(value: Date | string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function AdminUsers() {
  const { user } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const result = Route.useLoaderData();
  const [query, setQuery] = useState(search.q ?? "");
  const [pendingUser, setPendingUser] = useState<{
    id: string;
    email: string;
    suspend: boolean;
  } | null>(null);

  type Row = (typeof result.items)[number];

  function updateSearch(patch: Partial<typeof search>) {
    navigate({ to: "/admin/users", search: { ...search, ...patch, page: 1 } });
  }

  async function runStatusAction(userId: string, suspend: boolean, reason?: string) {
    const result = await updateUserStatusFn({
      data: { userId, action: suspend ? "SUSPEND" : "REACTIVATE", reason },
    });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(suspend ? "Account suspended." : "Account reactivated.");
    await router.invalidate();
  }

  const columns: Column<Row>[] = [
    {
      key: "email",
      header: "Email",
      render: (u) => <span className="font-medium">{u.email}</span>,
    },
    {
      key: "role",
      header: "Role",
      render: (u) => <StatusBadge status={formatStatusLabel(u.role)} />,
    },
    {
      key: "status",
      header: "Status",
      render: (u) => <StatusBadge status={formatStatusLabel(u.status)} />,
    },
    {
      key: "lastLogin",
      header: "Last login",
      render: (u) => formatDateTime(u.lastLoginAt),
      hideOnCard: true,
    },
    {
      key: "joined",
      header: "Joined",
      render: (u) => formatDateTime(u.createdAt),
      hideOnCard: true,
    },
    {
      key: "actions",
      header: "",
      render: (u) =>
        // An admin can't act on their own account — the server enforces this
        // too, this just avoids offering a button that would always fail.
        u.id === user.id ? (
          <span className="text-xs text-muted-foreground">You</span>
        ) : u.status === "SUSPENDED" ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPendingUser({ id: u.id, email: u.email, suspend: false })}
          >
            Reactivate
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="text-destructive"
            onClick={() => setPendingUser({ id: u.id, email: u.email, suspend: true })}
          >
            Suspend
          </Button>
        ),
    },
  ];

  return (
    <DashboardLayout
      role="admin"
      user={{ name: user.displayName, subtitle: "Platform operations" }}
    >
      <PageHeader title="Users" description="Every account on the platform." />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <form
          className="relative sm:w-64"
          onSubmit={(e) => {
            e.preventDefault();
            updateSearch({ q: query || undefined });
          }}
        >
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by email…"
            className="pl-9"
          />
        </form>

        <Select
          value={search.role ?? ALL}
          onValueChange={(v) => updateSearch({ role: v === ALL ? undefined : (v as never) })}
        >
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="All roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All roles</SelectItem>
            <SelectItem value="PATIENT">Patient</SelectItem>
            <SelectItem value="DOCTOR">Doctor</SelectItem>
            <SelectItem value="HOSPITAL_ADMIN">Hospital admin</SelectItem>
            <SelectItem value="ADMIN">Admin</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={search.status ?? ALL}
          onValueChange={(v) => updateSearch({ status: v === ALL ? undefined : (v as never) })}
        >
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="PENDING_VERIFICATION">Pending verification</SelectItem>
            <SelectItem value="SUSPENDED">Suspended</SelectItem>
            <SelectItem value="DEACTIVATED">Deactivated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={result.items}
        emptyTitle="No users found"
        emptyDescription="Try adjusting the filters."
      />

      {result.totalPages > 1 && (
        <div className="mt-5">
          <Pagination
            page={result.page}
            totalPages={result.totalPages}
            onChange={(page) => navigate({ to: "/admin/users", search: { ...search, page } })}
          />
        </div>
      )}

      {pendingUser && (
        <AdminConfirmDialog
          open
          onOpenChange={(open) => !open && setPendingUser(null)}
          title={
            pendingUser.suspend
              ? `Suspend ${pendingUser.email}?`
              : `Reactivate ${pendingUser.email}?`
          }
          description={
            pendingUser.suspend
              ? "They'll be signed out immediately and blocked from signing back in. Their data and history are kept."
              : "They'll be able to sign in again. Provider verification status is not changed by this."
          }
          confirmLabel={pendingUser.suspend ? "Suspend account" : "Reactivate account"}
          destructive={pendingUser.suspend}
          requiresReason={pendingUser.suspend}
          onConfirm={(reason) => runStatusAction(pendingUser.id, pendingUser.suspend, reason)}
        />
      )}
    </DashboardLayout>
  );
}
