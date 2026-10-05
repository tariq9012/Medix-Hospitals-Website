import { createFileRoute, useRouter } from "@tanstack/react-router";

import { PageHeader } from "@/components/common";
import { CatalogManager } from "@/components/hospital/CatalogManager";
import { HospitalPendingNotice } from "@/components/hospital/HospitalPendingNotice";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  createServiceFn,
  getHospitalContextFn,
  listServicesFn,
  toggleServiceFn,
} from "@/lib/hospital/functions";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

export const Route = createFileRoute("/hospital/services")({
  beforeLoad: requireRoleBeforeLoad("HOSPITAL_ADMIN"),
  loader: async () => {
    const [context, services] = await Promise.all([getHospitalContextFn(), listServicesFn()]);
    return { context, services };
  },
  head: () => ({
    meta: [
      { title: "Services — Medix" },
      { name: "description", content: "Services your hospital offers." },
    ],
  }),
  component: HospitalServices,
});

function HospitalServices() {
  const { user } = Route.useRouteContext();
  const { context, services } = Route.useLoaderData();
  const router = useRouter();

  return (
    <DashboardLayout
      role="hospital"
      user={{ name: user.displayName, subtitle: context.hospital.name }}
    >
      <PageHeader title="Services" description="What your hospital offers patients." />

      {!context.isOperational && (
        <div className="mb-6">
          <HospitalPendingNotice
            status={context.hospital.verificationStatus}
            reason={context.hospital.verificationReason}
          />
        </div>
      )}

      <CatalogManager
        items={services.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          isActive: s.isActive,
          secondaryLabel: s.category,
        }))}
        itemNoun="service"
        extraFieldLabel="Category (optional)"
        extraFieldPlaceholder="e.g. Diagnostics"
        canManage={context.isOperational}
        onCreate={async ({ name, description, extra }) => {
          const res = await createServiceFn({ data: { name, description, category: extra } });
          if (res.ok) await router.invalidate();
          return res;
        }}
        onToggle={async (serviceId, isActive) => {
          const res = await toggleServiceFn({ data: { serviceId, isActive } });
          if (res.ok) await router.invalidate();
          return res;
        }}
      />
    </DashboardLayout>
  );
}
