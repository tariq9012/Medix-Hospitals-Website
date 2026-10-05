import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

export const Route = createFileRoute("/hospital/staff")({
  beforeLoad: requireRoleBeforeLoad("HOSPITAL_ADMIN"),
  head: () => ({
    meta: [
      { title: "Staff — Medix" },
      { name: "description", content: "Manage hospital staff accounts." },
    ],
  }),
  component: () => (
    <ComingSoon
      role="hospital"
      icon={Users}
      title="Staff"
      description="Manage hospital staff accounts."
    />
  ),
});
