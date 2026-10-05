import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";
import { listMyNotificationsFn } from "@/lib/notifications/functions";

export const Route = createFileRoute("/patient/notifications")({
  beforeLoad: requireRoleBeforeLoad("PATIENT"),
  loader: () => listMyNotificationsFn(),
  head: () => ({
    meta: [
      { title: "Notifications — Medix" },
      {
        name: "description",
        content: "Updates about your appointments, prescriptions and messages.",
      },
    ],
  }),
  component: PatientNotificationsPage,
});

function PatientNotificationsPage() {
  const { user } = Route.useRouteContext();
  const notifications = Route.useLoaderData();

  return (
    <DashboardLayout role="patient" user={{ name: user.displayName, subtitle: "Patient account" }}>
      <PageHeader
        title="Notifications"
        description="Updates about your appointments, prescriptions, records, and messages."
      />
      <NotificationCenter role="patient" notifications={notifications} />
    </DashboardLayout>
  );
}
