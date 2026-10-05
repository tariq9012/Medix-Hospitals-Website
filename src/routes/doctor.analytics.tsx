import { createFileRoute } from "@tanstack/react-router";
import { Activity } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

export const Route = createFileRoute("/doctor/analytics")({
  beforeLoad: requireRoleBeforeLoad("DOCTOR"),
  head: () => ({
    meta: [
      { title: "Analytics — Medix" },
      { name: "description", content: "Insights into your practice performance." },
    ],
  }),
  component: () => (
    <ComingSoon
      role="doctor"
      icon={Activity}
      title="Analytics"
      description="Insights into your practice performance."
    />
  ),
});
