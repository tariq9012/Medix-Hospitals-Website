import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
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
import { createMedicalRecordFn, getMedicalRecordForAppointmentFn } from "@/lib/clinical/functions";
import { getDoctorAppointmentFn } from "@/lib/doctor/functions";

const searchSchema = z.object({ appointmentId: z.string().uuid() });

export const Route = createFileRoute("/doctor/records/new")({
  beforeLoad: requireRoleBeforeLoad("DOCTOR"),
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ appointmentId: search.appointmentId }),
  loader: async ({ deps }) => {
    const appointment = await getDoctorAppointmentFn({
      data: { appointmentId: deps.appointmentId },
    });
    if (!appointment || appointment.status !== "COMPLETED") throw notFound();
    const existing = await getMedicalRecordForAppointmentFn({
      data: { appointmentId: deps.appointmentId },
    });
    if (existing) {
      // A record already exists for this appointment — don't render a
      // create form that would just collide with the DB unique constraint.
      throw notFound();
    }
    return { appointment };
  },
  notFoundComponent: () => (
    <DashboardLayout role="doctor">
      <EmptyState
        title="Can't create a medical record here"
        description="This appointment isn't completed, doesn't belong to you, or already has a medical record."
        action={
          <Button asChild>
            <Link to="/doctor/appointments">Back to appointments</Link>
          </Button>
        }
      />
    </DashboardLayout>
  ),
  component: CreateMedicalRecordPage,
});

function CreateMedicalRecordPage() {
  const { user } = Route.useRouteContext();
  const { appointment } = Route.useLoaderData();
  const navigate = useNavigate();

  const [chiefComplaint, setChiefComplaint] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [treatmentPlan, setTreatmentPlan] = useState("");
  const [followUpInstructions, setFollowUpInstructions] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await createMedicalRecordFn({
        data: {
          appointmentId: appointment.id,
          chiefComplaint: chiefComplaint || undefined,
          diagnosis,
          clinicalNotes: clinicalNotes || undefined,
          treatmentPlan: treatmentPlan || undefined,
          followUpInstructions: followUpInstructions || undefined,
          followUpDate: followUpDate || undefined,
        },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success("Medical record created.");
      navigate({ to: "/doctor/records/$id", params: { id: result.recordId } });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <DashboardLayout role="doctor" user={{ name: user.displayName, subtitle: "Doctor account" }}>
      <PageHeader
        breadcrumbs={[{ label: "Medical Records", to: "/doctor/records" }, { label: "New record" }]}
        title="Create medical record"
        description={`For ${appointment.patientFirstName} ${appointment.patientLastName}'s completed appointment.`}
      />

      <Card className="max-w-2xl">
        <CardContent className="p-6">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="chiefComplaint">Chief complaint</Label>
              <Input
                id="chiefComplaint"
                value={chiefComplaint}
                onChange={(e) => setChiefComplaint(e.target.value)}
                placeholder="e.g. Persistent headache for 3 days"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="diagnosis">
                Diagnosis <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="diagnosis"
                required
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                rows={2}
                placeholder="Clinical diagnosis"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="clinicalNotes">Clinical notes</Label>
              <Textarea
                id="clinicalNotes"
                value={clinicalNotes}
                onChange={(e) => setClinicalNotes(e.target.value)}
                rows={4}
                placeholder="Examination findings, observations…"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="treatmentPlan">Treatment plan</Label>
              <Textarea
                id="treatmentPlan"
                value={treatmentPlan}
                onChange={(e) => setTreatmentPlan(e.target.value)}
                rows={3}
                placeholder="Recommended treatment"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="followUpInstructions">Follow-up instructions</Label>
                <Textarea
                  id="followUpInstructions"
                  value={followUpInstructions}
                  onChange={(e) => setFollowUpInstructions(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="followUpDate">Follow-up date</Label>
                <Input
                  id="followUpDate"
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                />
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2">
              <Button type="submit" disabled={isSubmitting || diagnosis.trim().length === 0}>
                {isSubmitting ? "Saving…" : "Create medical record"}
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
