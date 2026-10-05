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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";
import { getDoctorAppointmentFn } from "@/lib/doctor/functions";
import { uploadMedicalDocumentFn } from "@/lib/documents/functions";
import { documentTypeSchema } from "@/lib/validation/documents";

const searchSchema = z.object({
  appointmentId: z.string().uuid(),
  recordId: z.string().uuid().optional(),
});

const DOCUMENT_TYPE_LABELS: Record<z.infer<typeof documentTypeSchema>, string> = {
  LAB_REPORT: "Lab report",
  IMAGING_REPORT: "Imaging report",
  DIAGNOSTIC_REPORT: "Diagnostic report",
  DISCHARGE_SUMMARY: "Discharge summary",
  REFERRAL: "Referral",
  CLINICAL_ATTACHMENT: "Clinical attachment",
  OTHER: "Other",
};

export const Route = createFileRoute("/doctor/reports/new")({
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
        title="Can't upload a document here"
        description="This appointment isn't completed, or doesn't belong to you."
        action={
          <Button asChild>
            <Link to="/doctor/appointments">Back to appointments</Link>
          </Button>
        }
      />
    </DashboardLayout>
  ),
  component: UploadDocumentPage,
});

const MAX_UPLOAD_MB = 10;

function UploadDocumentPage() {
  const { user } = Route.useRouteContext();
  const { appointment, recordId } = Route.useLoaderData();
  const navigate = useNavigate();

  const [documentType, setDocumentType] = useState<z.infer<typeof documentTypeSchema>>("OTHER");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!file) {
      setError("Please choose a file to upload.");
      return;
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setError(`File is too large. The maximum allowed size is ${MAX_UPLOAD_MB}MB.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("appointmentId", appointment.id);
      if (recordId) formData.set("medicalRecordId", recordId);
      formData.set("documentType", documentType);
      formData.set("title", title);
      if (description) formData.set("description", description);

      const result = await uploadMedicalDocumentFn({ data: formData });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success("Document uploaded.");
      navigate({ to: "/doctor/reports/$id", params: { id: result.documentId } });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <DashboardLayout role="doctor" user={{ name: user.displayName, subtitle: "Doctor account" }}>
      <PageHeader
        breadcrumbs={[{ label: "Reports", to: "/doctor/reports" }, { label: "Upload document" }]}
        title="Upload medical document"
        description={`For ${appointment.patientFirstName} ${appointment.patientLastName}'s completed appointment.`}
      />

      <Card className="max-w-2xl">
        <CardContent className="p-6">
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="documentType">Document type</Label>
              <Select
                value={documentType}
                onValueChange={(v) => setDocumentType(v as z.infer<typeof documentTypeSchema>)}
              >
                <SelectTrigger id="documentType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {documentTypeSchema.options.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {DOCUMENT_TYPE_LABELS[opt]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Complete Blood Count — 12 Sept 2026"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="file">
                File <span className="text-destructive">*</span>
              </Label>
              <Input
                id="file"
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                required
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">
                PDF, JPEG, or PNG only. Maximum {MAX_UPLOAD_MB}MB.
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2">
              <Button type="submit" disabled={isSubmitting || title.trim().length < 2 || !file}>
                {isSubmitting ? "Uploading…" : "Upload document"}
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
