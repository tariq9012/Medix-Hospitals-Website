import { createFileRoute } from "@tanstack/react-router";
import { FileBarChart } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

export const Route = createFileRoute("/hospital/analytics")({
  beforeLoad: requireRoleBeforeLoad("HOSPITAL_ADMIN"),
  head: () => ({
    meta: [
      { title: "Analytics — Medix" },
      { name: "description", content: "Insights into hospital performance." },
    ],
  }),
  component: () => (
    <ComingSoon
      role="hospital"
      icon={FileBarChart}
      title="Analytics"
      description="Insights into hospital performance."
    />
  ),
});
