import { createFileRoute } from "@tanstack/react-router";
import { Newspaper } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

export const Route = createFileRoute("/admin/articles")({
  beforeLoad: requireRoleBeforeLoad("ADMIN"),
  head: () => ({
    meta: [
      { title: "Articles — Medix" },
      { name: "description", content: "Manage published health articles." },
    ],
  }),
  component: () => (
    <ComingSoon
      role="admin"
      icon={Newspaper}
      title="Articles"
      description="Manage published health articles."
    />
  ),
});
