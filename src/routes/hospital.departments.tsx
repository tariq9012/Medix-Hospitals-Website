import { createFileRoute, useRouter } from "@tanstack/react-router";

import { PageHeader } from "@/components/common";
import { CatalogManager } from "@/components/hospital/CatalogManager";
import { HospitalPendingNotice } from "@/components/hospital/HospitalPendingNotice";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  createDepartmentFn,
  getHospitalContextFn,
  listDepartmentsFn,
  toggleDepartmentFn,
} from "@/lib/hospital/functions";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

export const Route = createFileRoute("/hospital/departments")({
  beforeLoad: requireRoleBeforeLoad("HOSPITAL_ADMIN"),
  loader: async () => {
    const [context, departments] = await Promise.all([getHospitalContextFn(), listDepartmentsFn()]);
    return { context, departments };
  },
  head: () => ({
    meta: [
      { title: "Departments — Medix" },
      { name: "description", content: "Manage hospital departments." },
    ],
  }),
  component: HospitalDepartments,
});

function HospitalDepartments() {
  const { user } = Route.useRouteContext();
  const { context, departments } = Route.useLoaderData();
  const router = useRouter();

  return (
    <DashboardLayout
      role="hospital"
      user={{ name: user.displayName, subtitle: context.hospital.name }}
    >
      <PageHeader title="Departments" description="The clinical departments your hospital runs." />

      {!context.isOperational && (
        <div className="mb-6">
          <HospitalPendingNotice
            status={context.hospital.verificationStatus}
            reason={context.hospital.verificationReason}
          />
        </div>
      )}

      <CatalogManager
        items={departments.map((d) => ({
          id: d.id,
          name: d.name,
          description: d.description,
          isActive: d.isActive,
          secondaryLabel: d.location,
          tertiaryLabel: d.phoneExtension ? `Ext. ${d.phoneExtension}` : null,
        }))}
        itemNoun="department"
        extraFieldLabel="Location / floor (optional)"
        extraFieldPlaceholder="e.g. Block B, 2nd floor"
        canManage={context.isOperational}
        onCreate={async ({ name, description, extra }) => {
          const res = await createDepartmentFn({ data: { name, description, location: extra } });
          if (res.ok) await router.invalidate();
          return res;
        }}
        onToggle={async (departmentId, isActive) => {
          const res = await toggleDepartmentFn({ data: { departmentId, isActive } });
          if (res.ok) await router.invalidate();
          return res;
        }}
      />
    </DashboardLayout>
  );
}
