import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { DoctorCard } from "@/components/cards/DoctorCard";
import { HospitalCard } from "@/components/cards/HospitalCard";
import { EmptyState, PageHeader, SectionHeading } from "@/components/common";
import { DirectoryError, DirectoryPending } from "@/components/directory/DirectoryStates";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { getSpecialtyPageFn } from "@/lib/directory/functions";

export const Route = createFileRoute("/specialties/$slug")({
  loader: async ({ params }) => {
    const data = await getSpecialtyPageFn({ data: { slug: params.slug } });
    if (!data) throw notFound();
    return data;
  },
  pendingComponent: () => <DirectoryPending title="Specialty" />,
  errorComponent: DirectoryError,
  notFoundComponent: () => (
    <PublicLayout>
      <div className="container-page py-20">
        <EmptyState
          title="Specialty not found"
          action={
            <Button asChild>
              <Link to="/specialties">All specialties</Link>
            </Button>
          }
        />
      </div>
    </PublicLayout>
  ),
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.specialty.name ?? "Specialty"} — Doctors & Hospitals | Medix` },
      {
        name: "description",
        content: loaderData
          ? `Find verified ${loaderData.specialty.name} doctors and hospitals on Medix.`
          : "Specialty not found.",
      },
    ],
  }),
  component: SpecialtyPage,
});

function SpecialtyPage() {
  const { specialty, doctors, doctorTotal, hospitals, hospitalTotal, viewerRole } =
    Route.useLoaderData();
  return (
    <PublicLayout>
      <div className="container-page space-y-12 py-10">
        <PageHeader
          breadcrumbs={[
            { label: "Home", to: "/" },
            { label: "Specialties", to: "/specialties" },
            { label: specialty.name },
          ]}
          title={specialty.name}
          // Only real, stored description text — never invented medical copy.
          description={specialty.description ?? undefined}
        />

        <section>
          <SectionHeading
            title={`${specialty.name} doctors`}
            description={`${doctorTotal} verified ${doctorTotal === 1 ? "doctor" : "doctors"}`}
            action={
              doctorTotal > doctors.length ? (
                <Button variant="outline" asChild>
                  <Link to="/doctors" search={{ specialty: specialty.slug }}>
                    View all {doctorTotal}
                  </Link>
                </Button>
              ) : undefined
            }
          />
          {doctors.length === 0 ? (
            <EmptyState
              title="No doctors found"
              description="No verified doctors list this specialty yet."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {doctors.map((d) => (
                <DoctorCard key={d.id} doctor={d} viewerRole={viewerRole} />
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionHeading
            title={`${specialty.name} hospitals`}
            description={`${hospitalTotal} verified ${hospitalTotal === 1 ? "hospital" : "hospitals"}`}
            action={
              hospitalTotal > hospitals.length ? (
                <Button variant="outline" asChild>
                  <Link to="/hospitals" search={{ specialty: specialty.slug }}>
                    View all {hospitalTotal}
                  </Link>
                </Button>
              ) : undefined
            }
          />
          {hospitals.length === 0 ? (
            <EmptyState
              title="No hospitals found"
              description="No verified hospitals list this specialty yet."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {hospitals.map((h) => (
                <HospitalCard key={h.id} hospital={h} viewerRole={viewerRole} />
              ))}
            </div>
          )}
        </section>
      </div>
    </PublicLayout>
  );
}
