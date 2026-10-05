import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { CalendarDays, Droplet, Phone, User } from "lucide-react";

import { DataTable, type Column } from "@/components/common/DataTable";
import { EmptyState, PageHeader, StatusBadge } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { MessageButton } from "@/components/messaging/MessageButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatStatusLabel } from "@/lib/appointments/status";
import { listDoctorMedicalRecordsForPatientFn } from "@/lib/clinical/functions";
import type { DoctorMedicalRecordRow } from "@/lib/clinical/queries.server";
import { getDoctorPatientFn } from "@/lib/doctor/functions";
import type { DoctorAppointmentRow } from "@/lib/doctor/queries.server";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

export const Route = createFileRoute("/doctor/patients/$id")({
  beforeLoad: requireRoleBeforeLoad("DOCTOR"),
  loader: async ({ params }) => {
    // getDoctorPatientFn returns null both when the patient doesn't exist
    // AND when this doctor has no appointment relationship with them — the
    // two cases are indistinguishable on purpose (see src/lib/doctor/queries.server.ts).
    const patient = await getDoctorPatientFn({ data: { patientId: params.id } });
    if (!patient) throw notFound();
    // Only records THIS doctor personally created — never another doctor's
    // notes about the same patient (rule #20).
    const medicalRecords = await listDoctorMedicalRecordsForPatientFn({
      data: { patientId: params.id },
    });
    return { patient, medicalRecords };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Patient not found — Medix" }, { name: "robots", content: "noindex" }],
      };
    }
    const title = `${loaderData.patient.firstName} ${loaderData.patient.lastName} — Medix`;
    return { meta: [{ title }, { name: "description", content: title }] };
  },
  notFoundComponent: () => (
    <DashboardLayout role="doctor">
      <EmptyState
        title="Patient not found"
        description="This patient doesn't exist, or you don't have an appointment relationship with them."
        action={
          <Button asChild>
            <Link to="/doctor/patients">Back to patients</Link>
          </Button>
        }
      />
    </DashboardLayout>
  ),
  component: DoctorPatientDetail,
});

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function calculateAge(dob: string | null): string {
  if (!dob) return "—";
  const birth = new Date(`${dob}T00:00:00`);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const hasHadBirthdayThisYear =
    now.getMonth() > birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return `${age} years`;
}

function DoctorPatientDetail() {
  const { user } = Route.useRouteContext();
  const { patient, medicalRecords } = Route.useLoaderData();

  const recordColumns: Column<DoctorMedicalRecordRow>[] = [
    { key: "date", header: "Visit date", render: (r) => formatDate(r.appointmentDate) },
    {
      key: "diagnosis",
      header: "Diagnosis",
      render: (r) => <span className="line-clamp-1">{r.diagnosis || "—"}</span>,
    },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <Button variant="outline" size="sm" asChild>
          <Link to="/doctor/records/$id" params={{ id: r.id }}>
            View
          </Link>
        </Button>
      ),
    },
  ];

  const columns: Column<DoctorAppointmentRow>[] = [
    {
      key: "date",
      header: "Date",
      render: (a) => `${formatDate(a.appointmentDate)} · ${a.startTime.slice(0, 5)}`,
    },
    {
      key: "type",
      header: "Type",
      render: (a) => (a.consultationType === "ONLINE" ? "Video" : "In-person"),
    },
    {
      key: "status",
      header: "Status",
      render: (a) => <StatusBadge status={formatStatusLabel(a.status)} />,
    },
    {
      key: "actions",
      header: "",
      render: (a) => (
        <Button variant="outline" size="sm" asChild>
          <Link to="/doctor/appointments/$id" params={{ id: a.id }}>
            View
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <DashboardLayout role="doctor" user={{ name: user.displayName, subtitle: "Doctor account" }}>
      <PageHeader
        breadcrumbs={[
          { label: "Patients", to: "/doctor/patients" },
          { label: `${patient.firstName} ${patient.lastName}` },
        ]}
        title={`${patient.firstName} ${patient.lastName}`}
        description={`${patient.appointments.length} appointment(s) with you`}
        actions={<MessageButton as="doctor" targetId={patient.patientId} />}
      />

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card>
          <CardContent className="space-y-4 p-6">
            <span className="mx-auto grid size-16 place-items-center rounded-full bg-primary-soft text-lg font-semibold text-primary">
              {patient.firstName[0]}
              {patient.lastName[0]}
            </span>
            <dl className="space-y-3 text-sm">
              <Field icon={User} label="Gender" value={patient.gender ?? "—"} />
              <Field icon={CalendarDays} label="Age" value={calculateAge(patient.dateOfBirth)} />
              <Field icon={Droplet} label="Blood group" value={patient.bloodGroup ?? "—"} />
              {patient.phone && <Field icon={Phone} label="Phone" value={patient.phone} />}
            </dl>
          </CardContent>
        </Card>

        <div>
          <h2 className="mb-3 font-semibold">Appointment history with you</h2>
          <DataTable
            columns={columns}
            rows={patient.appointments}
            emptyTitle="No appointments yet"
          />

          <h2 className="mb-3 mt-8 font-semibold">Medical records you've created</h2>
          <DataTable
            columns={recordColumns}
            rows={medicalRecords}
            emptyTitle="No medical records yet"
            emptyDescription="Records you create for this patient's completed appointments will appear here."
          />
        </div>
      </div>
    </DashboardLayout>
  );
}

function Field({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" /> {label}
      </span>
      <span className="font-medium capitalize">{value.toLowerCase()}</span>
    </div>
  );
}
