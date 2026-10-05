import { createFileRoute } from "@tanstack/react-router";
import { Bell } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

export const Route = createFileRoute("/admin/notifications")({
  beforeLoad: requireRoleBeforeLoad("ADMIN"),
  head: () => ({
    meta: [
      { title: "Notifications — Medix" },
      { name: "description", content: "Platform notification activity." },
    ],
  }),
  component: () => (
    <ComingSoon
      role="admin"
      icon={Bell}
      title="Notifications"
      description="Platform notification activity."
    />
  ),
});
