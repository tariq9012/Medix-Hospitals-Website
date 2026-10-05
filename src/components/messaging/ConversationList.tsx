import { Link, useRouter } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";

import { EmptyState } from "@/components/common";
import type { ConversationListRow } from "@/lib/messaging/queries.server";
import { useRealtimeRevalidate } from "@/lib/realtime/client";

function formatRelativeTime(date: Date | string): string {
  const d = new Date(date);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

export function ConversationList({
  conversations,
  basePath,
  otherPartyLabelPrefix,
}: {
  conversations: ConversationListRow[];
  basePath: "/patient/messages" | "/doctor/messages";
  /** "Dr." for the patient's list (doctors as the other party), "" for the doctor's list (patients). */
  otherPartyLabelPrefix?: string;
}) {
  const router = useRouter();
  // New message / read-state change => re-run the list loader (authoritative
  // DB order, previews, unread counts). Coalesced, so a burst is one reload.
  useRealtimeRevalidate(["MESSAGE_CREATED", "CONVERSATION_READ"], () => router.invalidate());

  if (conversations.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="No conversations yet"
        description="Conversations you start from an appointment will show up here."
      />
    );
  }

  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {conversations.map((c) => {
        const name = `${otherPartyLabelPrefix ? `${otherPartyLabelPrefix} ` : ""}${c.otherPartyFirstName} ${c.otherPartyLastName}`;
        const isUnread = c.unreadCount > 0;
        return (
          <Link
            key={c.id}
            to={basePath === "/patient/messages" ? "/patient/messages/$id" : "/doctor/messages/$id"}
            params={{ id: c.id }}
            className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-surface"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
              {c.otherPartyFirstName[0]}
              {c.otherPartyLastName[0]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className={isUnread ? "truncate font-semibold" : "truncate font-medium"}>
                  {name}
                </p>
                {c.lastMessageAt && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatRelativeTime(c.lastMessageAt)}
                  </span>
                )}
              </div>
              <p
                className={
                  isUnread
                    ? "truncate text-sm font-medium text-foreground"
                    : "truncate text-sm text-muted-foreground"
                }
              >
                {c.lastMessageBody ?? "No messages yet — say hello."}
              </p>
            </div>
            {isUnread && (
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                {c.unreadCount > 9 ? "9+" : c.unreadCount}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
