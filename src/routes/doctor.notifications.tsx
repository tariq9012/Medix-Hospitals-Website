import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";
import { listMyNotificationsFn } from "@/lib/notifications/functions";

export const Route = createFileRoute("/doctor/notifications")({
  beforeLoad: requireRoleBeforeLoad("DOCTOR"),
  loader: () => listMyNotificationsFn(),
  head: () => ({
    meta: [
      { title: "Notifications — Medix" },
      { name: "description", content: "Updates about your appointments and messages." },
    ],
  }),
  component: DoctorNotificationsPage,
});

function DoctorNotificationsPage() {
  const { user } = Route.useRouteContext();
  const notifications = Route.useLoaderData();

  return (
    <DashboardLayout role="doctor" user={{ name: user.displayName, subtitle: "Doctor account" }}>
      <PageHeader
        title="Notifications"
        description="Updates about your appointments, verification status, and messages."
      />
      <NotificationCenter role="doctor" notifications={notifications} />
    </DashboardLayout>
  );
}
