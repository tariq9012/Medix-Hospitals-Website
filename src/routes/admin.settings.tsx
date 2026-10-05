import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

export const Route = createFileRoute("/admin/settings")({
  beforeLoad: requireRoleBeforeLoad("ADMIN"),
  head: () => ({
    meta: [
      { title: "Settings — Medix" },
      { name: "description", content: "Platform-wide configuration." },
    ],
  }),
  component: () => (
    <ComingSoon
      role="admin"
      icon={Settings}
      title="Settings"
      description="Platform-wide configuration."
    />
  ),
});
