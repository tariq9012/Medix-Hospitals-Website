import type { LucideIcon } from "lucide-react";
import { Construction } from "lucide-react";

import { PageHeader } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import type { Role } from "@/types";

/**
 * Placeholder for dashboard routes that are planned but not built yet.
 *
 * This exists so every link in `nav-config.ts` resolves to a real,
 * type-checked route (keeping `@tanstack/react-router`'s generated route
 * types — and therefore `tsc`/the production build — green) without faking
 * any backend functionality. Swap the route's `component` for the real page
 * once the feature ships; nothing else needs to change.
 */
export function ComingSoon({
  role,
  title,
  description,
  icon: Icon = Construction,
}: {
  role: Role;
  title: string;
  description: string;
  icon?: LucideIcon;
}) {
  return (
    <DashboardLayout role={role}>
      <PageHeader title={title} description={description} />
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-primary-soft text-primary">
            <Icon className="size-7" aria-hidden="true" />
          </span>
          <div className="max-w-md space-y-1.5">
            <h2 className="text-lg font-semibold">Feature in development</h2>
            <p className="text-sm text-muted-foreground">
              {title} is part of Medix's roadmap and isn't available yet. We're building it out in
              an upcoming release — check back soon.
            </p>
          </div>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
