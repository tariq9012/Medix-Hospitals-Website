import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AdminConfirmDialog } from "@/components/admin/AdminConfirmDialog";
import { EmptyState, PageHeader, StatusBadge } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { decideProviderVerificationFn, getAdminHospitalFn } from "@/lib/admin/functions";
import { formatStatusLabel } from "@/lib/appointments/status";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";
import type { VerificationAction } from "@/lib/validation/admin";

export const Route = createFileRoute("/admin/hospital-verification/$id")({
  beforeLoad: requireRoleBeforeLoad("ADMIN"),
  loader: async ({ params }) => {
    const hospital = await getAdminHospitalFn({ data: { hospitalId: params.id } });
    if (!hospital) throw notFound();
    return { hospital };
  },
  head: ({ loaderData }) =>
    loaderData
      ? { meta: [{ title: `Review ${loaderData.hospital.name} — Medix` }] }
      : { meta: [{ title: "Hospital not found — Medix" }] },
  notFoundComponent: () => (
    <DashboardLayout role="admin">
      <EmptyState
        title="Hospital not found"
        description="This hospital record doesn't exist."
        action={
          <Button asChild>
            <Link to="/admin/hospital-verification">Back to queue</Link>
          </Button>
        }
      />
    </DashboardLayout>
  ),
  component: HospitalVerificationDetail,
});

interface PendingAction {
  action: VerificationAction;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  requiresReason?: boolean;
}

function formatDateTime(value: Date | string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function HospitalVerificationDetail() {
  const { user } = Route.useRouteContext();
  const { hospital } = Route.useLoaderData();
  const router = useRouter();
  const [pending, setPending] = useState<PendingAction | null>(null);

  async function runDecision(action: VerificationAction, reason?: string) {
    const result = await decideProviderVerificationFn({
      data: { providerType: "HOSPITAL", providerId: hospital.id, action, reason },
    });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success("Verification updated.");
    await router.invalidate();
  }

  const available: PendingAction[] = [];
  if (hospital.verificationStatus === "PENDING") {
    available.push({
      action: "APPROVE",
      title: `Approve ${hospital.name}?`,
      description:
        "The hospital becomes operational and can be listed and associated with doctors.",
      confirmLabel: "Approve hospital",
    });
    available.push({
      action: "REJECT",
      title: `Reject ${hospital.name}?`,
      description:
        "The hospital stays blocked from operational use. The reason is stored permanently.",
      confirmLabel: "Reject hospital",
      destructive: true,
      requiresReason: true,
    });
  }
  if (hospital.verificationStatus === "APPROVED") {
    available.push({
      action: "SUSPEND",
      title: `Suspend ${hospital.name}?`,
      description:
        "The hospital stops being operational. Existing appointments and records are kept, not deleted.",
      confirmLabel: "Suspend hospital",
      destructive: true,
      requiresReason: true,
    });
  }
  if (hospital.verificationStatus === "SUSPENDED") {
    available.push({
      action: "REACTIVATE",
      title: `Reactivate ${hospital.name}?`,
      description: "The hospital's approved status will be restored.",
      confirmLabel: "Reactivate hospital",
    });
  }
  if (hospital.verificationStatus === "REJECTED") {
    available.push({
      action: "REOPEN",
      title: `Reopen review for ${hospital.name}?`,
      description: "The application returns to the pending queue for a fresh decision.",
      confirmLabel: "Reopen review",
    });
  }

  return (
    <DashboardLayout
      role="admin"
      user={{ name: user.displayName, subtitle: "Platform operations" }}
    >
      <PageHeader
        breadcrumbs={[
          { label: "Hospital verification", to: "/admin/hospital-verification" },
          { label: hospital.name },
        ]}
        title={hospital.name}
        description={hospital.email ?? undefined}
        actions={<StatusBadge status={formatStatusLabel(hospital.verificationStatus)} />}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-4 p-6">
              <h2 className="font-semibold">Submitted details</h2>
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <Field label="Phone" value={hospital.phone ?? "Not provided"} />
                <Field label="Email" value={hospital.email ?? "Not provided"} />
                <Field label="City" value={hospital.city ?? "—"} />
                <Field label="Country" value={hospital.country ?? "—"} />
                <Field label="Address" value={hospital.address ?? "Not provided"} />
                <Field label="Registered" value={formatDateTime(hospital.createdAt)} />
              </dl>

              {hospital.facilities && hospital.facilities.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Facilities</h3>
                    <div className="flex flex-wrap gap-2">
                      {hospital.facilities.map((f) => (
                        <Badge key={f} variant="secondary">
                          {f}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <Separator />
              <div>
                <h3 className="mb-1 text-sm font-semibold">Description</h3>
                <p className="text-sm text-muted-foreground">
                  {hospital.description || "No description provided."}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-6">
              <h2 className="font-semibold">Verification history</h2>
              {hospital.history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No decisions recorded yet.</p>
              ) : (
                <ul className="space-y-3">
                  {hospital.history.map((event) => (
                    <li key={event.id} className="rounded-lg border border-border p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={formatStatusLabel(event.previousStatus)} />
                        <span className="text-muted-foreground">→</span>
                        <StatusBadge status={formatStatusLabel(event.newStatus)} />
                        <span className="ml-auto text-xs text-muted-foreground">
                          {formatDateTime(event.createdAt)}
                        </span>
                      </div>
                      {event.reason && <p className="mt-2 text-muted-foreground">{event.reason}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <aside>
          <Card>
            <CardContent className="space-y-3 p-6">
              <h2 className="font-semibold">Decision</h2>
              {hospital.verificationReason && (
                <div className="rounded-lg bg-muted p-3 text-sm">
                  <p className="text-xs font-medium text-muted-foreground">
                    Current reason on file
                  </p>
                  <p className="mt-1">{hospital.verificationReason}</p>
                </div>
              )}
              {available.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No further actions are available for this status.
                </p>
              ) : (
                available.map((a) => (
                  <Button
                    key={a.action}
                    className="w-full"
                    variant={a.destructive ? "outline" : "default"}
                    onClick={() => setPending(a)}
                  >
                    {a.confirmLabel}
                  </Button>
                ))
              )}
            </CardContent>
          </Card>
        </aside>
      </div>

      {pending && (
        <AdminConfirmDialog
          open
          onOpenChange={(open) => !open && setPending(null)}
          title={pending.title}
          description={pending.description}
          confirmLabel={pending.confirmLabel}
          destructive={pending.destructive}
          requiresReason={pending.requiresReason}
          onConfirm={(reason) => runDecision(pending.action, reason)}
        />
      )}
    </DashboardLayout>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
