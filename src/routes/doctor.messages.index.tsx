import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ConversationList } from "@/components/messaging/ConversationList";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";
import { listMyConversationsFn } from "@/lib/messaging/functions";

export const Route = createFileRoute("/doctor/messages/")({
  beforeLoad: requireRoleBeforeLoad("DOCTOR"),
  loader: () => listMyConversationsFn(),
  head: () => ({
    meta: [
      { title: "Messages — Medix" },
      { name: "description", content: "Secure messages with your patients." },
    ],
  }),
  component: DoctorMessagesPage,
});

function DoctorMessagesPage() {
  const { user } = Route.useRouteContext();
  const conversations = Route.useLoaderData();

  return (
    <DashboardLayout role="doctor" user={{ name: user.displayName, subtitle: "Doctor account" }}>
      <PageHeader title="Messages" description="Secure conversations with your patients." />
      <ConversationList conversations={conversations} basePath="/doctor/messages" />
    </DashboardLayout>
  );
}
