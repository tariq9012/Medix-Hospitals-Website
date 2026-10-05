import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

export const Route = createFileRoute("/doctor/settings")({
  beforeLoad: requireRoleBeforeLoad("DOCTOR"),
  head: () => ({
    meta: [
      { title: "Settings — Medix" },
      { name: "description", content: "Manage your account and preferences." },
    ],
  }),
  component: () => (
    <ComingSoon
      role="doctor"
      icon={Settings}
      title="Settings"
      description="Manage your account and preferences."
    />
  ),
});
