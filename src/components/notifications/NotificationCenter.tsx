import { Link, useRouter } from "@tanstack/react-router";
import { Bell, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { markAllNotificationsReadFn, markNotificationReadFn } from "@/lib/notifications/functions";
import type { Notification } from "@/db/schema";
import { useRealtimeRevalidate } from "@/lib/realtime/client";

function formatRelativeTime(date: Date | string): string {
  const d = new Date(date);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

/** Deep-links a notification to somewhere useful, based on its type/metadata — never guesses at clinical content. */
function notificationLink(notification: Notification, role: "patient" | "doctor"): string | null {
  const meta = notification.metadata as Record<string, unknown> | null;
  switch (notification.type) {
    case "NEW_MESSAGE": {
      const conversationId = meta?.["conversationId"];
      if (typeof conversationId === "string") {
        return role === "patient"
          ? `/patient/messages/${conversationId}`
          : `/doctor/messages/${conversationId}`;
      }
      return role === "patient" ? "/patient/messages" : "/doctor/messages";
    }
    case "APPOINTMENT_CONFIRMED":
    case "APPOINTMENT_CANCELLED":
    case "APPOINTMENT_COMPLETED":
    case "APPOINTMENT_REMINDER": {
      const appointmentId = meta?.["appointmentId"];
      if (typeof appointmentId === "string") {
        return role === "patient"
          ? `/patient/appointments/${appointmentId}`
          : `/doctor/appointments/${appointmentId}`;
      }
      return role === "patient" ? "/patient/appointments" : "/doctor/appointments";
    }
    case "MEDICAL_RECORD_AVAILABLE": {
      const recordId = meta?.["recordId"];
      return typeof recordId === "string"
        ? `/patient/medical-history/${recordId}`
        : "/patient/medical-history";
    }
    case "PRESCRIPTION_AVAILABLE":
      return "/patient/prescriptions";
    case "MEDICAL_DOCUMENT_AVAILABLE": {
      const documentId = meta?.["documentId"];
      return typeof documentId === "string" ? `/patient/reports/${documentId}` : "/patient/reports";
    }
    case "VERIFICATION_APPROVED":
    case "VERIFICATION_REJECTED":
    case "VERIFICATION_SUSPENDED":
      return "/doctor/profile";
    default:
      return null;
  }
}

export function NotificationCenter({
  role,
  notifications,
}: {
  role: "patient" | "doctor";
  notifications: Notification[];
}) {
  const router = useRouter();
  // Live list + multi-tab read sync: re-fetch when notifications change anywhere.
  useRealtimeRevalidate(
    ["NOTIFICATION_CREATED", "NOTIFICATION_READ", "NOTIFICATIONS_READ_ALL"],
    () => router.invalidate(),
  );
  const [markingAll, setMarkingAll] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const unreadCount = notifications.filter((n) => !n.readAt).length;

  async function handleMarkOne(id: string) {
    setPendingIds((prev) => new Set(prev).add(id));
    try {
      const result = await markNotificationReadFn({ data: { notificationId: id } });
      if (!result.ok) {
        toast.error("Could not mark this notification as read.");
      }
      router.invalidate();
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function handleMarkAll() {
    setMarkingAll(true);
    try {
      const result = await markAllNotificationsReadFn();
      if (!result.ok) {
        toast.error("Could not mark all notifications as read.");
      }
      router.invalidate();
    } finally {
      setMarkingAll(false);
    }
  }

  if (notifications.length === 0) {
    return (
      <EmptyState
        icon={Bell}
        title="No notifications yet"
        description="Updates about your appointments, records, prescriptions and messages will show up here."
      />
    );
  }

  return (
    <div className="space-y-4">
      {unreadCount > 0 && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={handleMarkAll} disabled={markingAll}>
            <Check className="size-4" aria-hidden="true" />
            {markingAll ? "Marking…" : "Mark all read"}
          </Button>
        </div>
      )}

      <div className="space-y-2">
        {notifications.map((notification) => {
          const link = notificationLink(notification, role);
          const isUnread = !notification.readAt;
          const isPending = pendingIds.has(notification.id);

          const body = (
            <Card className={isUnread ? "border-primary/40 bg-primary-soft/40" : "border-border"}>
              <CardContent className="flex items-start justify-between gap-4 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {isUnread && (
                      <span
                        className="size-2 shrink-0 rounded-full bg-primary"
                        aria-hidden="true"
                      />
                    )}
                    <p className="truncate font-medium">{notification.title}</p>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{notification.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatRelativeTime(notification.createdAt)}
                  </p>
                </div>
                {isUnread && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleMarkOne(notification.id);
                    }}
                  >
                    {isPending ? "…" : "Mark read"}
                  </Button>
                )}
              </CardContent>
            </Card>
          );

          return link ? (
            <Link key={notification.id} to={link} className="block">
              {body}
            </Link>
          ) : (
            <div key={notification.id}>{body}</div>
          );
        })}
      </div>
    </div>
  );
}
