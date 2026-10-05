import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
  Banknote,
  Building2,
  CalendarDays,
  GraduationCap,
  MapPin,
  MessageSquare,
  Video,
} from "lucide-react";

import { EmptyState, PageHeader, RatingSummary, VerifiedBadge } from "@/components/common";
import { DirectoryError, DirectoryPending } from "@/components/directory/DirectoryStates";
import { FavoriteButton } from "@/components/directory/FavoriteButton";
import { ReviewList } from "@/components/directory/ReviewList";
import { RatingBreakdown } from "@/components/directory/Stars";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getDoctorProfileFn, listPublicReviewsFn } from "@/lib/directory/functions";
import { formatPKR, initialsOf } from "@/lib/format";

export const Route = createFileRoute("/doctors/$id")({
  loader: async ({ params }) => {
    const { doctor, viewerRole } = await getDoctorProfileFn({ data: { key: params.id } });
    // Missing, pending, rejected and suspended doctors are all "not found" publicly.
    if (!doctor) throw notFound();
    const reviews = await listPublicReviewsFn({
      data: { target: "doctor", targetId: doctor.id, page: 1 },
    });
    return { doctor, viewerRole, reviews };
  },
  pendingComponent: () => <DirectoryPending title="Doctor profile" />,
  errorComponent: DirectoryError,
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Doctor not found — Medix" }, { name: "robots", content: "noindex" }],
      };
    }
    const { doctor } = loaderData;
    const bits = [
      doctor.primarySpecialty,
      doctor.yearsOfExperience !== null ? `${doctor.yearsOfExperience} years experience` : null,
      doctor.rating !== null
        ? `${doctor.rating.toFixed(1)} rating (${doctor.reviewCount} reviews)`
        : null,
    ].filter(Boolean);
    const title = `${doctor.name}${doctor.primarySpecialty ? ` — ${doctor.primarySpecialty}` : ""} | Medix`;
    const description = `Book ${doctor.name} on Medix. ${bits.join(" · ")}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  notFoundComponent: DoctorNotFound,
  component: DoctorProfile,
});

function DoctorNotFound() {
  return (
    <PublicLayout>
      <div className="container-page py-20">
        <EmptyState
          title="Doctor not found"
          description="This profile isn't available. The link may be incorrect or the doctor may not currently be listed."
          action={
            <Button asChild>
              <Link to="/doctors">Back to directory</Link>
            </Button>
          }
        />
      </div>
    </PublicLayout>
  );
}

const DAY_LABEL: Record<string, string> = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
};

function formatSlotDate(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, d);
  return `${dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} at ${time}`;
}

function DoctorProfile() {
  const { doctor, viewerRole, reviews } = Route.useLoaderData();
  const primaryHospital = doctor.hospitals.find((h) => h.isPrimary) ?? doctor.hospitals[0];

  const bookCta = (full = false) => (
    <Button className={full ? "w-full" : undefined} size={full ? "lg" : "default"} asChild>
      <Link to="/book" search={{ doctor: doctor.id }}>
        Book Appointment
      </Link>
    </Button>
  );

  return (
    <PublicLayout>
      <div className="container-page py-10">
        <PageHeader
          breadcrumbs={[
            { label: "Home", to: "/" },
            { label: "Doctors", to: "/doctors" },
            { label: doctor.name },
          ]}
          title={doctor.name}
          description={[doctor.primarySpecialty, doctor.qualifications.slice(0, 3).join(", ")]
            .filter(Boolean)
            .join(" · ")}
        />

        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <Card>
              <CardContent className="flex flex-col gap-6 p-6 sm:flex-row">
                <Avatar className="size-32 shrink-0 rounded-2xl">
                  {doctor.profileImage && <AvatarImage src={doctor.profileImage} alt="" />}
                  <AvatarFallback className="rounded-2xl bg-primary-soft text-3xl font-semibold text-primary">
                    {initialsOf(doctor.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-2xl font-bold">{doctor.name}</h2>
                    <VerifiedBadge />
                  </div>
                  {doctor.specialties.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {doctor.specialties.map((s) => (
                        <Link key={s.slug} to="/specialties/$slug" params={{ slug: s.slug }}>
                          <Badge variant={s.isPrimary ? "default" : "secondary"}>{s.name}</Badge>
                        </Link>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
                    <RatingSummary
                      rating={doctor.rating}
                      reviewCount={doctor.reviewCount}
                      size="md"
                    />
                    {doctor.yearsOfExperience !== null && (
                      <span>{doctor.yearsOfExperience} years experience</span>
                    )}
                    {doctor.consultationFee !== null && (
                      <span className="flex items-center gap-1.5">
                        <Banknote className="size-4" aria-hidden="true" />{" "}
                        {formatPKR(doctor.consultationFee)}
                      </span>
                    )}
                    {primaryHospital?.city && (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="size-4" aria-hidden="true" /> {primaryHospital.city}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {doctor.modes.includes("ONLINE") && (
                      <Badge className="gap-1 bg-success/12 text-success" variant="outline">
                        <Video className="size-3" aria-hidden="true" /> Online consultation
                      </Badge>
                    )}
                    {doctor.modes.includes("IN_PERSON") && (
                      <Badge variant="secondary">In-person</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {bookCta()}
                    <Button variant="outline" asChild>
                      <Link to="/patient/messages">
                        <MessageSquare className="size-4" aria-hidden="true" /> Send Message
                      </Link>
                    </Button>
                    <FavoriteButton
                      kind="doctor"
                      id={doctor.id}
                      initial={doctor.isFavorite}
                      viewerRole={viewerRole}
                      withLabel
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Tabs defaultValue="about">
              <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
                <TabsTrigger value="about">About</TabsTrigger>
                <TabsTrigger value="qualifications">Qualifications</TabsTrigger>
                <TabsTrigger value="hospitals">Hospitals</TabsTrigger>
                <TabsTrigger value="reviews">Reviews ({doctor.reviewCount})</TabsTrigger>
                <TabsTrigger value="availability">Availability</TabsTrigger>
              </TabsList>

              <TabsContent value="about" className="mt-4">
                <Card>
                  <CardContent className="space-y-3 p-6">
                    <h3 className="font-semibold">About {doctor.name}</h3>
                    {doctor.biography ? (
                      <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                        {doctor.biography}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        This doctor hasn't added a biography yet.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="qualifications" className="mt-4">
                <Card>
                  <CardContent className="p-6">
                    {doctor.qualifications.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No qualifications listed yet.</p>
                    ) : (
                      <ul className="grid gap-3 sm:grid-cols-2">
                        {doctor.qualifications.map((q) => (
                          <li
                            key={q}
                            className="flex items-center gap-3 rounded-lg border border-border p-4"
                          >
                            <GraduationCap
                              className="size-5 shrink-0 text-primary"
                              aria-hidden="true"
                            />
                            <span className="font-medium">{q}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="hospitals" className="mt-4 space-y-3">
                {doctor.hospitals.length === 0 ? (
                  <EmptyState
                    title="No hospital affiliations"
                    description="This doctor isn't currently affiliated with a listed hospital."
                  />
                ) : (
                  doctor.hospitals.map((h) => (
                    <Card key={h.id}>
                      <CardContent className="flex items-center justify-between gap-4 p-5">
                        <div className="flex items-center gap-3">
                          <Building2 className="size-5 text-primary" aria-hidden="true" />
                          <div>
                            <p className="font-medium">{h.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {[h.department, h.city].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                        </div>
                        <Button variant="outline" size="sm" asChild>
                          <Link to="/hospitals/$id" params={{ id: h.slug }}>
                            View hospital
                          </Link>
                        </Button>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              <TabsContent value="reviews" className="mt-4 space-y-4">
                {doctor.reviewCount > 0 && (
                  <Card>
                    <CardContent className="grid gap-6 p-6 sm:grid-cols-[200px_1fr]">
                      <div>
                        <p className="font-display text-4xl font-bold">
                          {doctor.rating?.toFixed(1)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          from {doctor.reviewCount} verified{" "}
                          {doctor.reviewCount === 1 ? "visit" : "visits"}
                        </p>
                      </div>
                      <RatingBreakdown
                        breakdown={doctor.ratingBreakdown}
                        total={doctor.reviewCount}
                      />
                    </CardContent>
                  </Card>
                )}
                <ReviewList target="doctor" targetId={doctor.id} initial={reviews} />
              </TabsContent>

              <TabsContent value="availability" className="mt-4">
                <Card>
                  <CardContent className="space-y-4 p-6">
                    {doctor.schedule.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        This doctor hasn't published a booking schedule yet.
                      </p>
                    ) : (
                      <ul className="divide-y divide-border">
                        {doctor.schedule.map((s, i) => (
                          <li
                            key={i}
                            className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
                          >
                            <span className="font-medium">
                              {DAY_LABEL[s.dayOfWeek] ?? s.dayOfWeek}
                            </span>
                            <span className="text-muted-foreground">
                              {s.startTime}–{s.endTime} ·{" "}
                              {s.consultationType === "ONLINE" ? "Online" : "In-person"}
                              {s.hospitalName ? ` · ${s.hospitalName}` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Weekly hours. Exact open times are shown when you book.
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <Card>
              <CardContent className="space-y-4 p-6">
                {doctor.consultationFee !== null && (
                  <div>
                    <p className="text-sm text-muted-foreground">Consultation fee</p>
                    <p className="font-display text-3xl font-bold">
                      {formatPKR(doctor.consultationFee)}
                    </p>
                  </div>
                )}
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CalendarDays
                    className="mt-0.5 size-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  {doctor.nextAvailable
                    ? `Next available: ${formatSlotDate(doctor.nextAvailable.date, doctor.nextAvailable.startTime)}`
                    : "No open slots in the next 14 days"}
                </div>
                {bookCta(true)}
              </CardContent>
            </Card>

            {primaryHospital && (
              <Card>
                <CardContent className="space-y-3 p-6">
                  <h3 className="font-semibold">Hospital / Clinic</h3>
                  <p className="font-medium">{primaryHospital.name}</p>
                  {primaryHospital.city && (
                    <p className="text-sm text-muted-foreground">{primaryHospital.city}</p>
                  )}
                  <Button variant="outline" className="w-full" asChild>
                    <Link to="/hospitals/$id" params={{ id: primaryHospital.slug }}>
                      View hospital
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )}
          </aside>
        </div>
      </div>
    </PublicLayout>
  );
}
