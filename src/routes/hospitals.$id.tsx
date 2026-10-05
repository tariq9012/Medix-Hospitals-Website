import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Building2, Clock, Mail, MapPin, Phone } from "lucide-react";

import { DoctorCard } from "@/components/cards/DoctorCard";
import { EmptyState, PageHeader, RatingSummary, VerifiedBadge } from "@/components/common";
import { DirectoryError, DirectoryPending } from "@/components/directory/DirectoryStates";
import { FavoriteButton } from "@/components/directory/FavoriteButton";
import { ReviewList } from "@/components/directory/ReviewList";
import { RatingBreakdown } from "@/components/directory/Stars";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getHospitalProfileFn, listPublicReviewsFn } from "@/lib/directory/functions";

export const Route = createFileRoute("/hospitals/$id")({
  loader: async ({ params }) => {
    const { hospital, viewerRole } = await getHospitalProfileFn({ data: { key: params.id } });
    if (!hospital) throw notFound();
    const reviews = await listPublicReviewsFn({
      data: { target: "hospital", targetId: hospital.id, page: 1 },
    });
    return { hospital, viewerRole, reviews };
  },
  pendingComponent: () => <DirectoryPending title="Hospital profile" />,
  errorComponent: DirectoryError,
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Hospital not found — Medix" }, { name: "robots", content: "noindex" }],
      };
    }
    const { hospital } = loaderData;
    const title = `${hospital.name}${hospital.city ? ` — ${hospital.city}` : ""} | Medix`;
    const description =
      hospital.description?.slice(0, 160) ??
      `${hospital.name}${hospital.city ? ` in ${hospital.city}` : ""}. View departments, services and doctors on Medix.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  notFoundComponent: HospitalNotFound,
  component: HospitalProfile,
});

function HospitalNotFound() {
  return (
    <PublicLayout>
      <div className="container-page py-20">
        <EmptyState
          title="Hospital not found"
          description="This profile isn't available. The link may be incorrect or the hospital may not currently be listed."
          action={
            <Button asChild>
              <Link to="/hospitals">Back to directory</Link>
            </Button>
          }
        />
      </div>
    </PublicLayout>
  );
}

function HospitalProfile() {
  const { hospital, viewerRole, reviews } = Route.useLoaderData();
  const image = hospital.coverImage ?? hospital.logo;
  const hours = hospital.openingHours ? Object.entries(hospital.openingHours) : [];

  return (
    <PublicLayout>
      <div className="container-page py-10">
        <PageHeader
          breadcrumbs={[
            { label: "Home", to: "/" },
            { label: "Hospitals", to: "/hospitals" },
            { label: hospital.name },
          ]}
          title={hospital.name}
          description={[hospital.city, hospital.country].filter(Boolean).join(", ")}
        />

        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <Card className="overflow-hidden">
              {image ? (
                <img src={image} alt={hospital.name} className="h-56 w-full object-cover" />
              ) : (
                <div className="grid h-40 w-full place-items-center bg-primary-soft text-primary">
                  <Building2 className="size-12" aria-hidden="true" />
                </div>
              )}
              <CardContent className="space-y-3 p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-2xl font-bold">{hospital.name}</h2>
                  <VerifiedBadge />
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
                  <RatingSummary
                    rating={hospital.rating}
                    reviewCount={hospital.reviewCount}
                    size="md"
                  />
                  {hospital.address && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="size-4" aria-hidden="true" /> {hospital.address}
                    </span>
                  )}
                </div>
                {hospital.specialties.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {hospital.specialties.map((s) => (
                      <Badge key={s} variant="secondary">
                        {s}
                      </Badge>
                    ))}
                  </div>
                )}
                <FavoriteButton
                  kind="hospital"
                  id={hospital.id}
                  initial={hospital.isFavorite}
                  viewerRole={viewerRole}
                  withLabel
                />
              </CardContent>
            </Card>

            <Tabs defaultValue="doctors">
              <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
                <TabsTrigger value="doctors">Doctors ({hospital.doctors.length})</TabsTrigger>
                <TabsTrigger value="about">About</TabsTrigger>
                <TabsTrigger value="departments">Departments</TabsTrigger>
                <TabsTrigger value="services">Services</TabsTrigger>
                <TabsTrigger value="reviews">Reviews ({hospital.reviewCount})</TabsTrigger>
              </TabsList>

              <TabsContent value="doctors" className="mt-4">
                {hospital.doctors.length === 0 ? (
                  <EmptyState
                    title="No doctors listed"
                    description="No verified doctors are currently affiliated with this hospital."
                  />
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {hospital.doctors.map((d) => (
                      <DoctorCard key={d.id} doctor={d} viewerRole={viewerRole} />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="about" className="mt-4">
                <Card>
                  <CardContent className="space-y-4 p-6">
                    {hospital.description ? (
                      <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                        {hospital.description}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No description has been added yet.
                      </p>
                    )}
                    {hospital.facilities.length > 0 && (
                      <div>
                        <h3 className="mb-2 font-semibold">Facilities</h3>
                        <div className="flex flex-wrap gap-2">
                          {hospital.facilities.map((f) => (
                            <Badge key={f} variant="outline">
                              {f}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="departments" className="mt-4">
                {hospital.departmentDetails.length === 0 ? (
                  <EmptyState title="No departments listed" />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {hospital.departmentDetails.map((d) => (
                      <Card key={d.name}>
                        <CardContent className="space-y-1 p-5">
                          <h3 className="font-semibold">{d.name}</h3>
                          {d.location && (
                            <p className="text-xs text-muted-foreground">{d.location}</p>
                          )}
                          {d.description && (
                            <p className="text-sm text-muted-foreground">{d.description}</p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="services" className="mt-4">
                {hospital.services.length === 0 ? (
                  <EmptyState title="No services listed" />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {hospital.services.map((s) => (
                      <Card key={s.name}>
                        <CardContent className="space-y-1 p-5">
                          <h3 className="font-semibold">{s.name}</h3>
                          {s.category && <Badge variant="secondary">{s.category}</Badge>}
                          {s.description && (
                            <p className="text-sm text-muted-foreground">{s.description}</p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="reviews" className="mt-4 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Ratings reflect patients' verified, completed visits at this hospital.
                </p>
                {hospital.reviewCount > 0 && (
                  <Card>
                    <CardContent className="grid gap-6 p-6 sm:grid-cols-[200px_1fr]">
                      <div>
                        <p className="font-display text-4xl font-bold">
                          {hospital.rating?.toFixed(1)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {hospital.reviewCount} reviews
                        </p>
                      </div>
                      <RatingBreakdown
                        breakdown={hospital.ratingBreakdown}
                        total={hospital.reviewCount}
                      />
                    </CardContent>
                  </Card>
                )}
                <ReviewList target="hospital" targetId={hospital.id} initial={reviews} />
              </TabsContent>
            </Tabs>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <Card>
              <CardContent className="space-y-3 p-6 text-sm">
                <h3 className="font-semibold">Contact</h3>
                {hospital.phone && (
                  <p className="flex items-center gap-2">
                    <Phone className="size-4 text-primary" aria-hidden="true" /> {hospital.phone}
                  </p>
                )}
                {hospital.email && (
                  <p className="flex items-center gap-2 break-all">
                    <Mail className="size-4 text-primary" aria-hidden="true" /> {hospital.email}
                  </p>
                )}
                {hospital.address && (
                  <p className="flex items-start gap-2">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    {hospital.address}
                  </p>
                )}
                {!hospital.phone && !hospital.email && !hospital.address && (
                  <p className="text-muted-foreground">No contact details listed.</p>
                )}
              </CardContent>
            </Card>
            {hours.length > 0 && (
              <Card>
                <CardContent className="space-y-2 p-6 text-sm">
                  <h3 className="flex items-center gap-2 font-semibold">
                    <Clock className="size-4 text-primary" aria-hidden="true" /> Opening hours
                  </h3>
                  <ul className="space-y-1">
                    {hours.map(([day, h]) => (
                      <li key={day} className="flex justify-between">
                        <span className="capitalize">{day}</span>
                        <span className="text-muted-foreground">
                          {h.open}–{h.close}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </aside>
        </div>
      </div>
    </PublicLayout>
  );
}
