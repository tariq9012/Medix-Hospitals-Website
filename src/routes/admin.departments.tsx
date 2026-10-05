import { createFileRoute } from "@tanstack/react-router";
import { Layers } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

export const Route = createFileRoute("/admin/departments")({
  beforeLoad: requireRoleBeforeLoad("ADMIN"),
  head: () => ({
    meta: [
      { title: "Departments — Medix" },
      { name: "description", content: "Departments across all hospitals." },
    ],
  }),
  component: () => (
    <ComingSoon
      role="admin"
      icon={Layers}
      title="Departments"
      description="Departments across all hospitals."
    />
  ),
});
