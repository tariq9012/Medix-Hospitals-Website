import { createFileRoute } from "@tanstack/react-router";
import { BadgeCheck } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

export const Route = createFileRoute("/admin/specializations")({
  beforeLoad: requireRoleBeforeLoad("ADMIN"),
  head: () => ({
    meta: [
      { title: "Specializations — Medix" },
      { name: "description", content: "Manage the platform's medical specialties." },
    ],
  }),
  component: () => (
    <ComingSoon
      role="admin"
      icon={BadgeCheck}
      title="Specializations"
      description="Manage the platform's medical specialties."
    />
  ),
});
