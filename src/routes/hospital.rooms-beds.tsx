import { createFileRoute } from "@tanstack/react-router";
import { BedDouble } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

export const Route = createFileRoute("/hospital/rooms-beds")({
  beforeLoad: requireRoleBeforeLoad("HOSPITAL_ADMIN"),
  head: () => ({
    meta: [
      { title: "Rooms & Beds — Medix" },
      { name: "description", content: "Manage room and bed availability." },
    ],
  }),
  component: () => (
    <ComingSoon
      role="hospital"
      icon={BedDouble}
      title="Rooms & Beds"
      description="Manage room and bed availability."
    />
  ),
});
