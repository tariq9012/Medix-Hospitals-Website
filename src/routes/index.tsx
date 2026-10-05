import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  Baby,
  Bone,
  Brain,
  Building2,
  CalendarCheck,
  ClipboardCheck,
  Ear,
  FlaskConical,
  FolderHeart,
  Heart,
  HeartPulse,
  Pill,
  ShieldCheck,
  Smile,
  Sparkles,
  Stethoscope,
  Video,
  type LucideIcon,
} from "lucide-react";

import { DoctorCard } from "@/components/cards/DoctorCard";
import { HospitalCard } from "@/components/cards/HospitalCard";
import { ArticleCard } from "@/components/cards/ArticleCard";
import { SectionHeading } from "@/components/common";
import { Stars } from "@/components/directory/Stars";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { QuickSearch } from "@/components/public/QuickSearch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getHomepageFn } from "@/lib/directory/functions";
// Health articles are still static content (out of Phase 13 scope).
import { articles } from "@/data/mock";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Medix — Find the Right Doctor. Get the Right Care." },
      {
        name: "description",
        content:
          "Discover verified doctors and hospitals, compare fees and ratings, and book in-person or video appointments in minutes with Medix.",
      },
      { property: "og:title", content: "Medix — Find the Right Doctor. Get the Right Care." },
      {
        property: "og:description",
        content:
          "Book verified doctors and hospitals, manage prescriptions, reports and consultations in one place.",
      },
    ],
  }),
  loader: () => getHomepageFn(),
  component: Home,
});

const specialtyIconBySlug: Record<string, LucideIcon> = {
  cardiology: HeartPulse,
  neurology: Brain,
  dermatology: Sparkles,
  orthopedics: Bone,
  pediatrics: Baby,
  ent: Ear,
  dentistry: Smile,
};

const serviceIcons: Record<string, LucideIcon> = {
  "Doctor Consultation": Stethoscope,
  "Online Consultation": Video,
  "Hospital Appointments": Building2,
  "Medical Records": FolderHeart,
  Prescriptions: Pill,
  "Lab Reports": FlaskConical,
};

const steps = [
  {
    title: "Find a Doctor",
    text: "Search by specialty, city, fee or rating and compare verified profiles.",
    icon: Stethoscope,
  },
  {
    title: "Choose a Time",
    text: "See live availability for video and in-clinic slots.",
    icon: CalendarCheck,
  },
  {
    title: "Book Appointment",
    text: "Confirm in a few taps and pay securely at checkout.",
    icon: ClipboardCheck,
  },
  {
    title: "Get Care",
    text: "Join online or visit the clinic, then get notes and prescriptions in your account.",
    icon: Heart,
  },
];

function Home() {
  const data = Route.useLoaderData();
  const { stats, viewerRole } = data;
  return (
    <PublicLayout>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-primary-soft/70 to-background">
        <div className="container-page grid items-center gap-12 py-16 lg:grid-cols-2 lg:py-24">
          <div>
            <Badge variant="outline" className="gap-1.5 border-primary/30 bg-card text-primary">
              <ShieldCheck className="size-3.5" aria-hidden="true" />{" "}
              {stats.doctors > 0
                ? `${stats.doctors} verified ${stats.doctors === 1 ? "specialist" : "specialists"}`
                : "Verified doctors and hospitals"}
            </Badge>
            <h1 className="mt-5 text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              Find the Right Doctor.
              <br />
              <span className="text-primary">Get the Right Care.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
              Medix brings verified doctors, trusted hospitals and your complete medical record into
              one calm, organised place — so booking the right appointment takes minutes, not days.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link to="/doctors">Find a Doctor</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/hospitals">Find a Hospital</Link>
              </Button>
            </div>
            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-6">
              {[
                { k: "Doctors", v: stats.doctors },
                { k: "Hospitals", v: stats.hospitals },
                { k: "Specialties", v: stats.specialties },
              ].map((x) => (
                <div key={x.k}>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{x.k}</dt>
                  <dd className="font-display text-2xl font-bold">{x.v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative">
            <img
              src="/images/hero-care.jpg"
              alt="A doctor discussing a treatment plan with a patient in a bright consultation room"
              width={1200}
              height={1200}
              className="aspect-square w-full rounded-3xl object-cover shadow-lift"
            />
          </div>
        </div>
      </section>

      {/* Quick search */}
      <section className="container-page -mt-8 pb-16 lg:-mt-10">
        <QuickSearch
          specialties={data.specialties.map((x) => ({ name: x.name, slug: x.slug }))}
          cities={data.cities}
        />
      </section>

      {/* Specialties */}
      {data.specialties.length > 0 && (
        <section className="container-page py-8">
          <SectionHeading
            eyebrow="Browse by need"
            title="Specialty categories"
            description="Specialties with verified doctors on Medix."
            action={
              <Button variant="ghost" asChild>
                <Link to="/specialties">All specialties</Link>
              </Button>
            }
          />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {data.specialties.map((sp) => {
              const Icon = specialtyIconBySlug[sp.slug] ?? Stethoscope;
              return (
                <Link
                  key={sp.id}
                  to="/specialties/$slug"
                  params={{ slug: sp.slug }}
                  className="group flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/35 hover:shadow-soft"
                >
                  <span className="grid size-11 place-items-center rounded-xl bg-primary-soft text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="font-medium">{sp.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {sp.doctorCount} {sp.doctorCount === 1 ? "doctor" : "doctors"}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Featured doctors */}
      {data.doctors.length > 0 && (
        <section className="container-page py-16">
          <SectionHeading
            eyebrow="Featured"
            title="Featured doctors"
            description="Verified doctors, ordered by patient rating and number of reviews."
            action={
              <Button variant="outline" asChild>
                <Link to="/doctors">Browse directory</Link>
              </Button>
            }
          />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.doctors.map((d) => (
              <DoctorCard key={d.id} doctor={d} viewerRole={viewerRole} />
            ))}
          </div>
        </section>
      )}

      {/* Hospitals */}
      {data.hospitals.length > 0 && (
        <section className="border-y border-border bg-surface py-16">
          <div className="container-page">
            <SectionHeading
              eyebrow="Partnered facilities"
              title="Featured hospitals"
              description="Verified hospitals and clinics, ordered by patient rating."
              action={
                <Button variant="outline" asChild>
                  <Link to="/hospitals">All hospitals</Link>
                </Button>
              }
            />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.hospitals.map((h) => (
                <HospitalCard key={h.id} hospital={h} viewerRole={viewerRole} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Services */}
      <section className="border-y border-border bg-surface py-16">
        <div className="container-page">
          <SectionHeading
            eyebrow="What you get"
            title="Healthcare services"
            description="Everything from first search to follow-up, kept in one record."
            align="center"
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(serviceIcons).map(([title, Icon]) => (
              <Card key={title}>
                <CardContent className="space-y-3 p-6">
                  <span className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {
                      {
                        "Doctor Consultation": "In-clinic appointments with verified specialists.",
                        "Online Consultation":
                          "Secure video visits with prescriptions issued to your account.",
                        "Hospital Appointments":
                          "Book departments and diagnostics at partnered hospitals.",
                        "Medical Records": "One timeline of diagnoses, notes and visit history.",
                        Prescriptions: "Digital prescriptions with dosage, duration and reminders.",
                        "Lab Reports":
                          "Upload, store and share results with any doctor in seconds.",
                      }[title]
                    }
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="container-page py-16">
        <SectionHeading eyebrow="Simple by design" title="How Medix works" align="center" />
        <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.title} className="relative rounded-xl border border-border bg-card p-6">
              <span className="font-display text-sm font-bold text-primary">0{i + 1}</span>
              <span className="mt-3 grid size-11 place-items-center rounded-xl bg-primary-soft text-primary">
                <s.icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Recent patient reviews (real, verified-appointment reviews only) */}
      {data.reviews.length > 0 && (
        <section className="border-y border-border bg-surface py-16">
          <div className="container-page">
            <SectionHeading
              eyebrow="Patient feedback"
              title="Recent patient reviews"
              align="center"
            />
            <div className="grid gap-4 md:grid-cols-3">
              {data.reviews.map((r) => (
                <Card key={r.id}>
                  <CardContent className="space-y-4 p-6">
                    <Stars value={r.rating} />
                    <p className="whitespace-pre-line break-words text-sm leading-relaxed">
                      {r.comment}
                    </p>
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback className="bg-primary-soft text-xs font-semibold text-primary">
                          {r.reviewerName[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{r.reviewerName}</p>
                        <p className="text-xs text-muted-foreground">
                          <Link
                            to="/doctors/$id"
                            params={{ id: r.doctorSlug }}
                            className="hover:underline"
                          >
                            {r.doctorName}
                          </Link>{" "}
                          · {formatDate(r.createdAt)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Articles */}
      <section className="container-page py-16">
        <SectionHeading
          eyebrow="Health library"
          title="Health articles"
          description="Practical guidance written and reviewed by Medix clinicians."
          action={
            <Button variant="outline" asChild>
              <Link to="/articles">All articles</Link>
            </Button>
          }
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {articles
            .filter((a) => a.status === "published")
            .slice(0, 3)
            .map((a) => (
              <ArticleCard key={a.id} article={a} />
            ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="container-page pb-8">
        <div className="overflow-hidden rounded-3xl bg-accent px-6 py-14 text-center text-accent-foreground sm:px-12">
          <Activity className="mx-auto size-8 opacity-80" aria-hidden="true" />
          <h2 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Your Health, Our Priority.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm opacity-85 sm:text-base">
            Join thousands of patients using Medix to find the right specialist and keep every
            record in one place.
          </p>
          <Button size="lg" variant="secondary" className="mt-8" asChild>
            <Link to="/book">Book an Appointment</Link>
          </Button>
        </div>
      </section>
    </PublicLayout>
  );
}
