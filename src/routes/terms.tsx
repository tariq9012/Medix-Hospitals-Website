import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/common";
import { PublicLayout } from "@/components/layout/PublicLayout";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Medix" },
      {
        name: "description",
        content:
          "The terms that govern use of Medix by patients, doctors and hospitals, including bookings, cancellations and acceptable use.",
      },
      { property: "og:title", content: "Terms of Service — Medix" },
      {
        property: "og:description",
        content: "Terms covering bookings, cancellations and acceptable use.",
      },
    ],
  }),
  component: TermsPage,
});

const sections = [
  {
    title: "Using Medix",
    body: "Medix is a booking and records platform. It does not provide medical advice. Care is delivered by the independent doctors and hospitals listed on the platform.",
  },
  {
    title: "Emergencies",
    body: "Never use Medix for emergencies. If someone is seriously unwell, call your local emergency number immediately.",
  },
  {
    title: "Bookings and cancellations",
    body: "Appointments can be rescheduled or cancelled up to two hours before the scheduled time. Late cancellations may incur the clinician's stated fee.",
  },
  {
    title: "Payments",
    body: "Consultation fees are set by clinicians. Medix charges a small platform fee shown before checkout. Refunds for cancelled appointments are returned to the original payment method.",
  },
  {
    title: "Clinician obligations",
    body: "Listed clinicians confirm their qualifications are current and accurate, keep their availability up to date, and maintain clinical records in line with professional standards.",
  },
  {
    title: "Acceptable use",
    body: "Do not misuse the platform: no impersonation, no scraping, no attempts to access records that are not yours. Accounts breaching these terms may be suspended.",
  },
];

function TermsPage() {
  return (
    <PublicLayout>
      <div className="container-page py-10">
        <PageHeader
          breadcrumbs={[{ label: "Home", to: "/" }, { label: "Terms of Service" }]}
          title="Terms of Service"
          description="Last updated 1 September 2026. This is demonstration content for the Medix prototype."
        />
        <div className="mx-auto max-w-3xl space-y-8">
          {sections.map((s) => (
            <section key={s.title}>
              <h2 className="text-lg font-semibold">{s.title}</h2>
              <p className="mt-2 leading-relaxed text-muted-foreground">{s.body}</p>
            </section>
          ))}
        </div>
      </div>
    </PublicLayout>
  );
}
