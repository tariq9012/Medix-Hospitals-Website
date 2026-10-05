import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AdminConfirmDialog } from "@/components/admin/AdminConfirmDialog";
import { EmptyState, PageHeader, StatusBadge } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { decideProviderVerificationFn, getAdminDoctorFn } from "@/lib/admin/functions";
import { formatStatusLabel } from "@/lib/appointments/status";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";
import type { VerificationAction } from "@/lib/validation/admin";

export const Route = createFileRoute("/admin/doctor-verification/$id")({
  beforeLoad: requireRoleBeforeLoad("ADMIN"),
  loader: async ({ params }) => {
    const doctor = await getAdminDoctorFn({ data: { doctorId: params.id } });
    if (!doctor) throw notFound();
    return { doctor };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Doctor not found — Medix" }] };
    const { doctor } = loaderData;
    return { meta: [{ title: `Review Dr. ${doctor.firstName} ${doctor.lastName} — Medix` }] };
  },
  notFoundComponent: () => (
    <DashboardLayout role="admin">
      <EmptyState
        title="Doctor not found"
        description="This doctor record doesn't exist."
        action={
          <Button asChild>
            <Link to="/admin/doctor-verification">Back to queue</Link>
          </Button>
        }
      />
    </DashboardLayout>
  ),
  component: DoctorVerificationDetail,
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

function DoctorVerificationDetail() {
  const { user } = Route.useRouteContext();
  const { doctor } = Route.useLoaderData();
  const router = useRouter();
  const [pending, setPending] = useState<PendingAction | null>(null);

  const name = `Dr. ${doctor.firstName} ${doctor.lastName}`;

  async function runDecision(action: VerificationAction, reason?: string) {
    const result = await decideProviderVerificationFn({
      data: { providerType: "DOCTOR", providerId: doctor.id, action, reason },
    });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success("Verification updated.");
    await router.invalidate();
  }

  // Which decisions are offered is driven by the current status, mirroring
  // the server-side transition matrix — the server re-checks regardless.
  const available: PendingAction[] = [];
  if (doctor.verificationStatus === "PENDING") {
    available.push({
      action: "APPROVE",
      title: `Approve ${name}?`,
      description:
        "They'll gain full Doctor Portal access and become bookable by patients once they set availability.",
      confirmLabel: "Approve doctor",
    });
    available.push({
      action: "REJECT",
      title: `Reject ${name}?`,
      description:
        "They'll keep their account but stay blocked from verified-provider features. The reason is stored permanently.",
      confirmLabel: "Reject doctor",
      destructive: true,
      requiresReason: true,
    });
  }
  if (doctor.verificationStatus === "APPROVED") {
    available.push({
      action: "SUSPEND",
      title: `Suspend ${name}?`,
      description:
        "They'll immediately lose Doctor Portal access and stop being bookable. Existing appointments and records are kept, not deleted.",
      confirmLabel: "Suspend doctor",
      destructive: true,
      requiresReason: true,
    });
  }
  if (doctor.verificationStatus === "SUSPENDED") {
    available.push({
      action: "REACTIVATE",
      title: `Reactivate ${name}?`,
      description: "Their verified status and Doctor Portal access will be restored.",
      confirmLabel: "Reactivate doctor",
    });
  }
  if (doctor.verificationStatus === "REJECTED") {
    available.push({
      action: "REOPEN",
      title: `Reopen review for ${name}?`,
      description: "Their application returns to the pending queue for a fresh decision.",
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
          { label: "Doctor verification", to: "/admin/doctor-verification" },
          { label: name },
        ]}
        title={name}
        description={doctor.email}
        actions={<StatusBadge status={formatStatusLabel(doctor.verificationStatus)} />}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-4 p-6">
              <h2 className="font-semibold">Submitted details</h2>
              <dl className="grid gap-4 sm:grid-cols-2 text-sm">
                <Field
                  label="Medical license"
                  value={doctor.medicalLicenseNumber ?? "Not provided"}
                />
                <Field
                  label="Years of experience"
                  value={doctor.yearsOfExperience != null ? `${doctor.yearsOfExperience}` : "—"}
                />
                <Field
                  label="Qualifications"
                  value={doctor.qualifications?.join(", ") || "Not provided"}
                />
                <Field
                  label="Consultation fee"
                  value={
                    doctor.consultationFee
                      ? `PKR ${Number(doctor.consultationFee).toLocaleString()}`
                      : "—"
                  }
                />
                <Field label="Registered" value={formatDateTime(doctor.createdAt)} />
                <Field label="Account status" value={formatStatusLabel(doctor.accountStatus)} />
              </dl>
              <Separator />
              <div>
                <h3 className="mb-1 text-sm font-semibold">Biography</h3>
                <p className="text-sm text-muted-foreground">
                  {doctor.biography || "No biography provided."}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-6">
              <h2 className="font-semibold">Verification history</h2>
              {doctor.history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No decisions recorded yet.</p>
              ) : (
                <ul className="space-y-3">
                  {doctor.history.map((event) => (
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
              {doctor.verificationReason && (
                <div className="rounded-lg bg-muted p-3 text-sm">
                  <p className="text-xs font-medium text-muted-foreground">
                    Current reason on file
                  </p>
                  <p className="mt-1">{doctor.verificationReason}</p>
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
