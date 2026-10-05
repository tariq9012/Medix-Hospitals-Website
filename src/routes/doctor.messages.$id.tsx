import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { EmptyState, PageHeader, StatusBadge } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ConversationView } from "@/components/messaging/ConversationView";
import { Button } from "@/components/ui/button";
import { formatStatusLabel } from "@/lib/appointments/status";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";
import { getConversationFn } from "@/lib/messaging/functions";

export const Route = createFileRoute("/doctor/messages/$id")({
  beforeLoad: requireRoleBeforeLoad("DOCTOR"),
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
          title: `${loaderData.detail.patientFirstName} ${loaderData.detail.patientLastName} — Medix`,
        },
      ],
    };
  },
  notFoundComponent: () => (
    <DashboardLayout role="doctor">
      <EmptyState
        title="Conversation not found"
        description="This conversation doesn't exist, or isn't associated with your account."
        action={
          <Button asChild>
            <Link to="/doctor/messages">Back to messages</Link>
          </Button>
        }
      />
    </DashboardLayout>
  ),
  component: DoctorConversationDetail,
});

function DoctorConversationDetail() {
  const { user } = Route.useRouteContext();
  const { detail, messages, hasMore, viewerId, disabledReason } = Route.useLoaderData();

  const patientLabel = `${detail.patientFirstName} ${detail.patientLastName}`;

  return (
    <DashboardLayout role="doctor" user={{ name: user.displayName, subtitle: "Doctor account" }}>
      <PageHeader
        breadcrumbs={[{ label: "Messages", to: "/doctor/messages" }, { label: patientLabel }]}
        title={patientLabel}
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
        otherPartyLabel={patientLabel}
        disabledReason={disabledReason}
      />
    </DashboardLayout>
  );
}
