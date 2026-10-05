import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ConversationList } from "@/components/messaging/ConversationList";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";
import { listMyConversationsFn } from "@/lib/messaging/functions";

export const Route = createFileRoute("/patient/messages/")({
  beforeLoad: requireRoleBeforeLoad("PATIENT"),
  loader: () => listMyConversationsFn(),
  head: () => ({
    meta: [
      { title: "Messages — Medix" },
      { name: "description", content: "Secure messages with your doctors." },
    ],
  }),
  component: PatientMessagesPage,
});

function PatientMessagesPage() {
  const { user } = Route.useRouteContext();
  const conversations = Route.useLoaderData();

  return (
    <DashboardLayout role="patient" user={{ name: user.displayName, subtitle: "Patient account" }}>
      <PageHeader title="Messages" description="Secure conversations with your doctors." />
      <ConversationList
        conversations={conversations}
        basePath="/patient/messages"
        otherPartyLabelPrefix="Dr."
      />
    </DashboardLayout>
  );
}
