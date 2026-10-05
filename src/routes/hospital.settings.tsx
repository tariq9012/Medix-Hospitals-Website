import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

export const Route = createFileRoute("/hospital/settings")({
  beforeLoad: requireRoleBeforeLoad("HOSPITAL_ADMIN"),
  head: () => ({
    meta: [
      { title: "Settings — Medix" },
      { name: "description", content: "Manage your hospital account and preferences." },
    ],
  }),
  component: () => (
    <ComingSoon
      role="hospital"
      icon={Settings}
      title="Settings"
      description="Manage your hospital account and preferences."
    />
  ),
});
