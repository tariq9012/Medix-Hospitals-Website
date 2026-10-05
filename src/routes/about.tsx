import { createFileRoute, Link } from "@tanstack/react-router";

import { getPublicStatsFn } from "@/lib/directory/functions";
import { HeartPulse, ShieldCheck, Sparkles, Users } from "lucide-react";

import { PageHeader, SectionHeading } from "@/components/common";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Medix — Care that Starts with Clarity" },
      {
        name: "description",
        content:
          "Medix connects patients with verified doctors and hospitals, and keeps appointments, prescriptions and reports in one calm place.",
      },
      { property: "og:title", content: "About Medix — Care that Starts with Clarity" },
      {
        property: "og:description",
        content:
          "Why Medix exists, how we verify clinicians, and the standards we hold ourselves to.",
      },
    ],
  }),
  loader: () => getPublicStatsFn(),
  component: AboutPage,
});

const values = [
  {
    icon: ShieldCheck,
    title: "Verified, always",
    text: "Every doctor and hospital listing is checked against licence records before it goes live.",
  },
  {
    icon: HeartPulse,
    title: "Care before clicks",
    text: "No dark patterns, no upsells at checkout. Booking should be the calmest part of being unwell.",
  },
  {
    icon: Users,
    title: "Built with clinicians",
    text: "Our scheduling and notes tools are shaped by the doctors who use them every day.",
  },
  {
    icon: Sparkles,
    title: "Records you own",
    text: "Prescriptions, reports and visit history stay in your account and travel with you.",
  },
];

function AboutPage() {
  const counts = Route.useLoaderData();
  // Real, live numbers from PostgreSQL (verified/public providers and published verified-visit reviews only).
  const stats = [
    { value: String(counts.doctors), label: "Verified doctors" },
    { value: String(counts.hospitals), label: "Partner hospitals" },
    { value: String(counts.specialties), label: "Specialties covered" },
    { value: String(counts.reviews), label: "Verified patient reviews" },
  ];
  return (
    <PublicLayout>
      <div className="container-page py-10">
        <PageHeader
          breadcrumbs={[{ label: "Home", to: "/" }, { label: "About" }]}
          title="Healthcare that respects your time"
          description="Medix began after one too many afternoons lost to phone queues and lost referral slips."
        />

        <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <div className="space-y-4 text-muted-foreground">
            <p className="leading-relaxed">
              Finding the right doctor should not depend on who you happen to know. Medix brings
              specialists, hospitals and diagnostics into one directory you can actually search — by
              specialty, city, fee, experience and real patient ratings.
            </p>
            <p className="leading-relaxed">
              Once you have booked, everything that follows stays together: your appointment
              history, digital prescriptions, lab reports and secure messages with your care team.
              Doctors get the same clarity from the other side, with schedules, clinical notes and
              earnings in one workspace.
            </p>
            <p className="leading-relaxed">
              We are a small team of engineers, designers and practising clinicians building the
              healthcare experience we wanted for our own families.
            </p>
          </div>
          <img
            src="/images/hero-care.jpg"
            alt="Medix care team reviewing a patient chart together"
            className="h-72 w-full rounded-2xl object-cover lg:h-96"
          />
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <Card key={s.label}>
              <CardContent className="p-6 text-center">
                <p className="font-display text-3xl font-bold text-primary">{s.value}</p>
                <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-16">
          <SectionHeading
            eyebrow="What we stand for"
            title="Four commitments we don't trade away"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {values.map((v) => (
              <Card key={v.title}>
                <CardContent className="space-y-3 p-6">
                  <span className="grid size-11 place-items-center rounded-xl bg-primary-soft text-primary">
                    <v.icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="font-semibold">{v.title}</h3>
                  <p className="text-sm text-muted-foreground">{v.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="surface-card mt-16 flex flex-col items-center gap-4 p-10 text-center">
          <h2 className="font-display text-2xl font-bold">Ready when you are</h2>
          <p className="max-w-xl text-muted-foreground">
            Search a specialty, compare doctors and book a slot that fits your week.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild size="lg">
              <Link to="/doctors">Find a Doctor</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/contact">Talk to us</Link>
            </Button>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
