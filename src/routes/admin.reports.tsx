import { createFileRoute } from "@tanstack/react-router";
import { FileBarChart } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

export const Route = createFileRoute("/admin/reports")({
  beforeLoad: requireRoleBeforeLoad("ADMIN"),
  head: () => ({
    meta: [
      { title: "Reports — Medix" },
      { name: "description", content: "Platform reporting and analytics." },
    ],
  }),
  component: () => (
    <ComingSoon
      role="admin"
      icon={FileBarChart}
      title="Reports"
      description="Platform reporting and analytics."
    />
  ),
});
