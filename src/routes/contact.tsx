import { createFileRoute } from "@tanstack/react-router";
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/common";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact Medix — Support for Patients and Partners" },
      {
        name: "description",
        content:
          "Reach the Medix support team about appointments, billing, doctor listings or hospital partnerships. Phone, email and a contact form.",
      },
      { property: "og:title", content: "Contact Medix — Support for Patients and Partners" },
      {
        property: "og:description",
        content: "Support for appointments, billing, listings and partnerships.",
      },
    ],
  }),
  component: ContactPage,
});

const details = [
  { icon: Phone, label: "Phone", value: "+92 21 111 63349", hint: "Mon–Sat, 8am – 10pm" },
  { icon: Mail, label: "Email", value: "support@medix.health", hint: "Replies within 24 hours" },
  {
    icon: MapPin,
    label: "Office",
    value: "5th Floor, Ocean Tower, Karachi",
    hint: "Visits by appointment",
  },
  {
    icon: Clock,
    label: "Emergency",
    value: "1122",
    hint: "For medical emergencies, call directly",
  },
];

function ContactPage() {
  const [values, setValues] = useState({ name: "", email: "", topic: "appointment", message: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!values.name.trim()) next["name"] = "Please enter your name.";
    if (!/^\S+@\S+\.\S+$/.test(values.email)) next["email"] = "Enter a valid email address.";
    if (values.message.trim().length < 10)
      next["message"] = "Tell us a little more (10+ characters).";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSent(true);
    toast.success("Message sent — our team will reply within 24 hours (demo)");
  }

  return (
    <PublicLayout>
      <div className="container-page py-10">
        <PageHeader
          breadcrumbs={[{ label: "Home", to: "/" }, { label: "Contact" }]}
          title="Contact Medix"
          description="Questions about an appointment, a listing or a partnership? We're here."
        />

        <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
          <Card>
            <CardContent className="p-6">
              <form className="space-y-5" onSubmit={submit} noValidate>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full name</Label>
                    <Input
                      id="name"
                      value={values.name}
                      onChange={(e) => setValues({ ...values, name: e.target.value })}
                      aria-invalid={Boolean(errors["name"])}
                    />
                    {errors["name"] && (
                      <p className="text-sm text-destructive" role="alert">
                        {errors["name"]}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email address</Label>
                    <Input
                      id="email"
                      type="email"
                      value={values.email}
                      onChange={(e) => setValues({ ...values, email: e.target.value })}
                      aria-invalid={Boolean(errors["email"])}
                    />
                    {errors["email"] && (
                      <p className="text-sm text-destructive" role="alert">
                        {errors["email"]}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="topic">What is this about?</Label>
                  <Select
                    value={values.topic}
                    onValueChange={(v) => setValues({ ...values, topic: v })}
                  >
                    <SelectTrigger id="topic">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="appointment">An appointment</SelectItem>
                      <SelectItem value="billing">Billing or refunds</SelectItem>
                      <SelectItem value="doctor">Listing my practice</SelectItem>
                      <SelectItem value="hospital">Hospital partnership</SelectItem>
                      <SelectItem value="other">Something else</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Message</Label>
                  <Textarea
                    id="message"
                    rows={6}
                    value={values.message}
                    onChange={(e) => setValues({ ...values, message: e.target.value })}
                    aria-invalid={Boolean(errors["message"])}
                    aria-describedby="message-help"
                  />
                  <p id="message-help" className="text-xs text-muted-foreground">
                    Please don't include sensitive medical details in this form.
                  </p>
                  {errors["message"] && (
                    <p className="text-sm text-destructive" role="alert">
                      {errors["message"]}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button type="submit">Send message</Button>
                  {sent && (
                    <p className="text-sm text-success" role="status">
                      Thanks — we've received your message.
                    </p>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>

          <aside className="space-y-4">
            {details.map((d) => (
              <Card key={d.label}>
                <CardContent className="flex gap-4 p-5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                    <d.icon className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">{d.label}</p>
                    <p className="font-medium">{d.value}</p>
                    <p className="text-xs text-muted-foreground">{d.hint}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </aside>
        </div>
      </div>
    </PublicLayout>
  );
}
