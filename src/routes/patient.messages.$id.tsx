import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { EmptyState, PageHeader, StatusBadge } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ConversationView } from "@/components/messaging/ConversationView";
import { Button } from "@/components/ui/button";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";
import { formatStatusLabel } from "@/lib/appointments/status";
import { getConversationFn } from "@/lib/messaging/functions";

export const Route = createFileRoute("/patient/messages/$id")({
  beforeLoad: requireRoleBeforeLoad("PATIENT"),
  loader: async ({ params }) => {
    const result = await getConversationFn({ data: { conversationId: params.id } });
    if (!result) throw notFound();
    return result;
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Conversation not found — Medix" }, { name: "robots", content: "noindex" }],
      };
    }
    return {
      meta: [
        {
          title: `Dr. ${loaderData.detail.doctorFirstName} ${loaderData.detail.doctorLastName} — Medix`,
        },
      ],
    };
  },
  notFoundComponent: () => (
    <DashboardLayout role="patient">
      <EmptyState
        title="Conversation not found"
        description="This conversation doesn't exist, or isn't associated with your account."
        action={
          <Button asChild>
            <Link to="/patient/messages">Back to messages</Link>
          </Button>
        }
      />
    </DashboardLayout>
  ),
  component: PatientConversationDetail,
});

function PatientConversationDetail() {
  const { user } = Route.useRouteContext();
  const { detail, messages, hasMore, viewerId, disabledReason } = Route.useLoaderData();

  const doctorLabel = `Dr. ${detail.doctorFirstName} ${detail.doctorLastName}`;

  return (
    <DashboardLayout role="patient" user={{ name: user.displayName, subtitle: "Patient account" }}>
      <PageHeader
        breadcrumbs={[{ label: "Messages", to: "/patient/messages" }, { label: doctorLabel }]}
        title={doctorLabel}
        description="Secure conversation"
        actions={
          detail.latestAppointmentStatus && (
            <StatusBadge status={formatStatusLabel(detail.latestAppointmentStatus)} />
          )
        }
      />
      <ConversationView
        conversationId={detail.id}
        viewerId={viewerId}
        initialMessages={messages}
        initialHasMore={hasMore}
        otherPartyLabel={doctorLabel}
        disabledReason={disabledReason}
      />
    </DashboardLayout>
  );
}
