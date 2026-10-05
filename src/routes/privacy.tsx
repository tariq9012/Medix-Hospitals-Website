import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/common";
import { PublicLayout } from "@/components/layout/PublicLayout";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Medix" },
      {
        name: "description",
        content:
          "How Medix collects, stores and protects patient information, and the choices you have over your health records.",
      },
      { property: "og:title", content: "Privacy Policy — Medix" },
      { property: "og:description", content: "How Medix handles and protects your health data." },
    ],
  }),
  component: PrivacyPage,
});

const sections = [
  {
    title: "Information we collect",
    body: "Account details you provide (name, contact information, date of birth), appointment records, and the clinical documents you or your doctors upload. We also collect basic technical data such as device type and pages visited so we can keep the service reliable.",
  },
  {
    title: "How we use it",
    body: "To confirm appointments, deliver prescriptions and reports to the right account, support billing, and improve the product. We do not sell personal or medical information, and we do not use your medical records for advertising.",
  },
  {
    title: "Who can see your records",
    body: "Only you, the clinicians you book with, and the hospital staff involved in that visit. Platform administrators can access records only where required for support or safety, and every such access is logged.",
  },
  {
    title: "Storage and security",
    body: "Data is encrypted in transit and at rest. Access is role-based, and clinical documents are stored separately from account credentials.",
  },
  {
    title: "Your choices",
    body: "You can export your records, correct your details, or ask us to delete your account at any time from Settings. Some appointment and billing records are retained where law requires it.",
  },
  {
    title: "Contact",
    body: "Questions about privacy can go to privacy@medix.health and we will respond within 30 days.",
  },
];

function PrivacyPage() {
  return (
    <PublicLayout>
      <div className="container-page py-10">
        <PageHeader
          breadcrumbs={[{ label: "Home", to: "/" }, { label: "Privacy Policy" }]}
          title="Privacy Policy"
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
