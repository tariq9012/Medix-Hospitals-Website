import { createFileRoute, Link } from "@tanstack/react-router";
import { Stethoscope } from "lucide-react";

import { EmptyState, PageHeader } from "@/components/common";
import { DirectoryError, DirectoryPending } from "@/components/directory/DirectoryStates";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { listSpecialtiesFn } from "@/lib/directory/functions";

export const Route = createFileRoute("/specialties/")({
  loader: () => listSpecialtiesFn(),
  pendingComponent: () => <DirectoryPending title="Specialties" />,
  errorComponent: DirectoryError,
  head: () => ({
    meta: [
      { title: "Medical Specialties — Medix" },
      {
        name: "description",
        content: "Browse medical specialties and find verified doctors and hospitals.",
      },
    ],
  }),
  component: SpecialtiesPage,
});

function SpecialtiesPage() {
  const list = Route.useLoaderData();
  return (
    <PublicLayout>
      <div className="container-page py-10">
        <PageHeader
          breadcrumbs={[{ label: "Home", to: "/" }, { label: "Specialties" }]}
          title="Specialties"
          description="Specialties with at least one verified provider on Medix."
        />
        {list.length === 0 ? (
          <EmptyState
            icon={Stethoscope}
            title="No specialties yet"
            description="Providers will appear here once they are verified."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((s) => (
              <Link
                key={s.id}
                to="/specialties/$slug"
                params={{ slug: s.slug }}
                className="rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/35 hover:shadow-soft"
              >
                <h2 className="font-semibold">{s.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {s.doctorCount} {s.doctorCount === 1 ? "doctor" : "doctors"} · {s.hospitalCount}{" "}
                  {s.hospitalCount === 1 ? "hospital" : "hospitals"}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
