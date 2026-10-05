import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

export const Route = createFileRoute("/admin/patients")({
  beforeLoad: requireRoleBeforeLoad("ADMIN"),
  head: () => ({
    meta: [
      { title: "Patients — Medix" },
      { name: "description", content: "All patients on the platform." },
    ],
  }),
  component: () => (
    <ComingSoon
      role="admin"
      icon={Users}
      title="Patients"
      description="All patients on the platform."
    />
  ),
});
