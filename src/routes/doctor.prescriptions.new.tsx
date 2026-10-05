import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { EmptyState, PageHeader } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";
import { createPrescriptionFn } from "@/lib/clinical/functions";
import type { PrescriptionItemInput } from "@/lib/validation/clinical";
import { getDoctorAppointmentFn } from "@/lib/doctor/functions";

const searchSchema = z.object({
  appointmentId: z.string().uuid(),
  recordId: z.string().uuid().optional(),
});

export const Route = createFileRoute("/doctor/prescriptions/new")({
  beforeLoad: requireRoleBeforeLoad("DOCTOR"),
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ appointmentId: search.appointmentId, recordId: search.recordId }),
  loader: async ({ deps }) => {
    const appointment = await getDoctorAppointmentFn({
      data: { appointmentId: deps.appointmentId },
    });
    if (!appointment || appointment.status !== "COMPLETED") throw notFound();
    return { appointment, recordId: deps.recordId };
  },
  notFoundComponent: () => (
    <DashboardLayout role="doctor">
      <EmptyState
        title="Can't create a prescription here"
        description="This appointment isn't completed, or doesn't belong to you."
        action={
          <Button asChild>
            <Link to="/doctor/appointments">Back to appointments</Link>
          </Button>
        }
      />
    </DashboardLayout>
  ),
  component: CreatePrescriptionPage,
});

const emptyItem: PrescriptionItemInput = {
  medicineName: "",
  dosage: "",
  frequency: "",
  duration: "",
  route: "",
  instructions: "",
};

function CreatePrescriptionPage() {
  const { user } = Route.useRouteContext();
  const { appointment, recordId } = Route.useLoaderData();
  const navigate = useNavigate();

  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<PrescriptionItemInput[]>([{ ...emptyItem }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateItem(index: number, patch: Partial<PrescriptionItemInput>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItems((prev) => [...prev, { ...emptyItem }]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  const validItems = items.filter((i) => i.medicineName.trim().length > 0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (validItems.length === 0) {
      setError("Add at least one medication.");
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await createPrescriptionFn({
        data: {
          appointmentId: appointment.id,
          medicalRecordId: recordId,
          notes: notes || undefined,
          items: validItems,
        },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success("Prescription created.");
      navigate({ to: "/doctor/prescriptions/$id", params: { id: result.prescriptionId } });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <DashboardLayout role="doctor" user={{ name: user.displayName, subtitle: "Doctor account" }}>
      <PageHeader
        breadcrumbs={[
          { label: "Prescriptions", to: "/doctor/prescriptions" },
          { label: "New prescription" },
        ]}
        title="Create prescription"
        description={`For ${appointment.patientFirstName} ${appointment.patientLastName}'s completed appointment.`}
      />

      <Card className="max-w-2xl">
        <CardContent className="p-6">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Medications</Label>
                <Button type="button" size="sm" variant="outline" onClick={addItem}>
                  <Plus className="size-4" aria-hidden="true" /> Add medication
                </Button>
              </div>

              {items.map((item, index) => (
                <div key={index} className="space-y-2 rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      Medicine {index + 1}
                    </span>
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
                      placeholder="Dosage (e.g. 500mg)"
                      value={item.dosage}
                      onChange={(e) => updateItem(index, { dosage: e.target.value })}
                    />
                    <Input
                      placeholder="Frequency (e.g. 2x/day)"
                      value={item.frequency}
                      onChange={(e) => updateItem(index, { frequency: e.target.value })}
                    />
                    <Input
                      placeholder="Duration (e.g. 5 days)"
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

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2">
              <Button type="submit" disabled={isSubmitting || validItems.length === 0}>
                {isSubmitting ? "Saving…" : "Create prescription"}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link to="/doctor/appointments/$id" params={{ id: appointment.id }}>
                  Cancel
                </Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
