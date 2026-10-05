import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Building2, CalendarDays, Plus, Trash2, User } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { EmptyState, PageHeader, StatusBadge } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  completePrescriptionFn,
  getDoctorPrescriptionFn,
  updatePrescriptionFn,
} from "@/lib/clinical/functions";
import type { PrescriptionItemInput } from "@/lib/validation/clinical";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

export const Route = createFileRoute("/doctor/prescriptions/$id")({
  beforeLoad: requireRoleBeforeLoad("DOCTOR"),
  loader: async ({ params }) => {
    const prescription = await getDoctorPrescriptionFn({ data: { prescriptionId: params.id } });
    if (!prescription) throw notFound();
    return { prescription };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Prescription not found — Medix" }, { name: "robots", content: "noindex" }],
      };
    }
    return { meta: [{ title: `Prescription — Medix` }] };
  },
  notFoundComponent: () => (
    <DashboardLayout role="doctor">
      <EmptyState
        title="Prescription not found"
        description="This prescription doesn't exist, or wasn't issued by your account."
        action={
          <Button asChild>
            <Link to="/doctor/prescriptions">Back to prescriptions</Link>
          </Button>
        }
      />
    </DashboardLayout>
  ),
  component: DoctorPrescriptionDetail,
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

function DoctorPrescriptionDetail() {
  const { user } = Route.useRouteContext();
  const { prescription } = Route.useLoaderData();
  const [editing, setEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notes, setNotes] = useState(prescription.notes ?? "");
  const [items, setItems] = useState<PrescriptionItemInput[]>(
    prescription.items.map((i) => ({
      medicineName: i.medicineName,
      dosage: i.dosage ?? "",
      frequency: i.frequency ?? "",
      duration: i.duration ?? "",
      route: i.route ?? "",
      instructions: i.instructions ?? "",
    })),
  );

  function updateItem(index: number, patch: Partial<PrescriptionItemInput>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      { medicineName: "", dosage: "", frequency: "", duration: "", route: "", instructions: "" },
    ]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setIsSubmitting(true);
    try {
      const result = await updatePrescriptionFn({
        data: {
          prescriptionId: prescription.id,
          notes: notes || undefined,
          items: items.filter((i) => i.medicineName.trim().length > 0),
        },
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Prescription updated.");
      setEditing(false);
      window.location.reload();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleComplete() {
    setIsSubmitting(true);
    try {
      const result = await completePrescriptionFn({ data: { prescriptionId: prescription.id } });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Prescription marked completed.");
      window.location.reload();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const canEdit = prescription.status === "ACTIVE";

  return (
    <DashboardLayout role="doctor" user={{ name: user.displayName, subtitle: "Doctor account" }}>
      <PageHeader
        breadcrumbs={[
          { label: "Prescriptions", to: "/doctor/prescriptions" },
          { label: `${prescription.patientFirstName} ${prescription.patientLastName}` },
        ]}
        title={`${prescription.patientFirstName} ${prescription.patientLastName}`}
        description={`Issued ${formatDate(prescription.issuedDate)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={prescription.status} />
            {canEdit && !editing && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            {canEdit && !editing && (
              <Button onClick={handleComplete} disabled={isSubmitting}>
                Mark completed
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Card>
          <CardContent className="space-y-6 p-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Medications</h3>
                {editing && (
                  <Button type="button" size="sm" variant="outline" onClick={addItem}>
                    <Plus className="size-4" aria-hidden="true" /> Add medication
                  </Button>
                )}
              </div>

              {editing ? (
                <div className="space-y-3">
                  {items.map((item, index) => (
                    <div key={index} className="space-y-2 rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Medicine {index + 1}</Label>
                        {items.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeItem(index)}
                          >
                            <Trash2 className="size-3.5" aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                      <Input
                        placeholder="Medicine name"
                        value={item.medicineName}
                        onChange={(e) => updateItem(index, { medicineName: e.target.value })}
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <Input
                          placeholder="Dosage"
                          value={item.dosage}
                          onChange={(e) => updateItem(index, { dosage: e.target.value })}
                        />
                        <Input
                          placeholder="Frequency"
                          value={item.frequency}
                          onChange={(e) => updateItem(index, { frequency: e.target.value })}
                        />
                        <Input
                          placeholder="Duration"
                          value={item.duration}
                          onChange={(e) => updateItem(index, { duration: e.target.value })}
                        />
                      </div>
                      <Input
                        placeholder="Instructions (optional)"
                        value={item.instructions}
                        onChange={(e) => updateItem(index, { instructions: e.target.value })}
                      />
                    </div>
                  ))}
                </div>
              ) : (
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
              )}
            </div>

            <Separator />

            <div className="space-y-1.5">
              <h3 className="font-semibold">Notes</h3>
              {editing ? (
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              ) : (
                <p className="text-sm text-muted-foreground">{prescription.notes || "—"}</p>
              )}
            </div>

            {editing && (
              <div className="flex gap-2">
                <Button
                  onClick={handleSave}
                  disabled={isSubmitting || items.every((i) => i.medicineName.trim().length === 0)}
                >
                  {isSubmitting ? "Saving…" : "Save changes"}
                </Button>
                <Button variant="outline" onClick={() => setEditing(false)} disabled={isSubmitting}>
                  Cancel
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <aside className="space-y-4">
          <Card>
            <CardContent className="space-y-4 p-6 text-sm">
              <Field icon={User} label="Patient">
                {prescription.patientFirstName} {prescription.patientLastName}
              </Field>
              <Field icon={CalendarDays} label="Issued">
                {formatDate(prescription.issuedDate)}
              </Field>
              <Field icon={Building2} label="Location">
                {prescription.hospitalName ?? "Online"}
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
