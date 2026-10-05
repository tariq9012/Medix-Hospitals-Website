import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { CalendarDays, User } from "lucide-react";
import type { ReactNode } from "react";

import { EmptyState, PageHeader, StatusBadge } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";
import { getMyPrescriptionFn } from "@/lib/clinical/functions";

export const Route = createFileRoute("/patient/prescriptions/$id")({
  beforeLoad: requireRoleBeforeLoad("PATIENT"),
  loader: async ({ params }) => {
    // Ownership enforced inside the query itself — never fetched globally
    // and filtered in React.
    const prescription = await getMyPrescriptionFn({ data: { prescriptionId: params.id } });
    if (!prescription) throw notFound();
    return { prescription };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Prescription not found — Medix" }, { name: "robots", content: "noindex" }],
      };
    }
    return { meta: [{ title: "Prescription — Medix" }] };
  },
  notFoundComponent: () => (
    <DashboardLayout role="patient">
      <EmptyState
        title="Prescription not found"
        description="This prescription doesn't exist, or isn't associated with your account."
        action={
          <Button asChild>
            <Link to="/patient/prescriptions">Back to prescriptions</Link>
          </Button>
        }
      />
    </DashboardLayout>
  ),
  component: PatientPrescriptionDetail,
});

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function PatientPrescriptionDetail() {
  const { user } = Route.useRouteContext();
  const { prescription } = Route.useLoaderData();

  return (
    <DashboardLayout role="patient" user={{ name: user.displayName, subtitle: "Patient account" }}>
      <PageHeader
        breadcrumbs={[
          { label: "Prescriptions", to: "/patient/prescriptions" },
          { label: formatDate(prescription.issuedDate) },
        ]}
        title={`Prescription from Dr. ${prescription.doctorFirstName} ${prescription.doctorLastName}`}
        description={`Issued ${formatDate(prescription.issuedDate)}`}
        actions={<StatusBadge status={prescription.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Card>
          <CardContent className="space-y-4 p-6">
            <h3 className="font-semibold">Medications</h3>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface/60">
                  <tr className="text-left">
                    <th className="p-3">Medicine</th>
                    <th className="p-3">Dosage</th>
                    <th className="p-3">Frequency</th>
                    <th className="p-3">Duration</th>
                    <th className="p-3">Instructions</th>
                  </tr>
                </thead>
                <tbody>
                  {prescription.items.map((item) => (
                    <tr key={item.id} className="border-t border-border">
                      <td className="p-3 font-medium">{item.medicineName}</td>
                      <td className="p-3">{item.dosage ?? "—"}</td>
                      <td className="p-3">{item.frequency ?? "—"}</td>
                      <td className="p-3">{item.duration ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">{item.instructions ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {prescription.notes && (
              <div className="space-y-1.5">
                <h3 className="font-semibold">Notes from your doctor</h3>
                <p className="text-sm text-muted-foreground">{prescription.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <aside className="space-y-4">
          <Card>
            <CardContent className="space-y-4 p-6 text-sm">
              <Field icon={User} label="Doctor">
                Dr. {prescription.doctorFirstName} {prescription.doctorLastName}
                {prescription.specialtyName ? ` · ${prescription.specialtyName}` : ""}
              </Field>
              <Field icon={CalendarDays} label="Issued">
                {formatDate(prescription.issuedDate)}
              </Field>
            </CardContent>
          </Card>
        </aside>
      </div>
    </DashboardLayout>
  );
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof User;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div>
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <p className="font-medium">{children}</p>
      </div>
    </div>
  );
}
