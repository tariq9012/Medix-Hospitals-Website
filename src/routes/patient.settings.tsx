import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

export const Route = createFileRoute("/patient/settings")({
  beforeLoad: requireRoleBeforeLoad("PATIENT"),
  head: () => ({
    meta: [
      { title: "Settings — Medix" },
      { name: "description", content: "Manage your account and notification preferences." },
    ],
  }),
  component: () => (
    <ComingSoon
      role="patient"
      icon={Settings}
      title="Settings"
      description="Manage your account and notification preferences."
    />
  ),
});
