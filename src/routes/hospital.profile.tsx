import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader, StatusBadge } from "@/components/common";
import { HospitalPendingNotice } from "@/components/hospital/HospitalPendingNotice";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatStatusLabel } from "@/lib/appointments/status";
import { getHospitalProfileFn, updateHospitalProfileFn } from "@/lib/hospital/functions";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

export const Route = createFileRoute("/hospital/profile")({
  beforeLoad: requireRoleBeforeLoad("HOSPITAL_ADMIN"),
  loader: () => getHospitalProfileFn(),
  head: () => ({
    meta: [
      { title: "Hospital Profile — Medix" },
      { name: "description", content: "Manage your hospital's public profile." },
    ],
  }),
  component: HospitalProfilePage,
});

function HospitalProfilePage() {
  const { user } = Route.useRouteContext();
  const hospital = Route.useLoaderData();
  const router = useRouter();
  const isOperational = hospital.verificationStatus === "APPROVED";

  const [form, setForm] = useState({
    name: hospital.name,
    description: hospital.description ?? "",
    phone: hospital.phone ?? "",
    email: hospital.email ?? "",
    address: hospital.address ?? "",
    city: hospital.city ?? "",
    country: hospital.country ?? "",
    logo: hospital.logo ?? "",
    coverImage: hospital.coverImage ?? "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const result = await updateHospitalProfileFn({
        data: {
          name: form.name,
          description: form.description || undefined,
          phone: form.phone || undefined,
          email: form.email,
          address: form.address || undefined,
          city: form.city || undefined,
          country: form.country || undefined,
          logo: form.logo,
          coverImage: form.coverImage,
        },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success("Hospital profile updated.");
      await router.invalidate();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <DashboardLayout role="hospital" user={{ name: user.displayName, subtitle: hospital.name }}>
      <PageHeader
        title="Hospital profile"
        description="What patients see when they view your hospital."
        actions={<StatusBadge status={formatStatusLabel(hospital.verificationStatus)} />}
      />

      {!isOperational && (
        <div className="mb-6">
          <HospitalPendingNotice
            status={hospital.verificationStatus}
            reason={hospital.verificationReason}
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardContent className="p-6">
            <form className="space-y-5" onSubmit={submit}>
              {error && (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              <div className="space-y-2">
                <Label htmlFor="name">Hospital name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  disabled={!isOperational}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  rows={4}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  disabled={!isOperational}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    disabled={!isOperational}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Contact email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    disabled={!isOperational}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  disabled={!isOperational}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    disabled={!isOperational}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    value={form.country}
                    onChange={(e) => setForm({ ...form, country: e.target.value })}
                    disabled={!isOperational}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="logo">Logo URL</Label>
                  <Input
                    id="logo"
                    value={form.logo}
                    onChange={(e) => setForm({ ...form, logo: e.target.value })}
                    placeholder="https://…"
                    disabled={!isOperational}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cover">Cover image URL</Label>
                  <Input
                    id="cover"
                    value={form.coverImage}
                    onChange={(e) => setForm({ ...form, coverImage: e.target.value })}
                    placeholder="https://…"
                    disabled={!isOperational}
                  />
                </div>
              </div>

              <Button type="submit" disabled={isSaving || !isOperational}>
                {isSaving ? "Saving…" : "Save changes"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-6 text-sm">
            <h3 className="font-semibold">Managed by Medix</h3>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Verification</span>
              <StatusBadge status={formatStatusLabel(hospital.verificationStatus)} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Public URL slug</span>
              <span className="font-mono text-xs">{hospital.slug}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Verification status and the public URL slug aren't editable here. The slug is your
              hospital's permanent public identity, and changing verification is a Medix admin
              decision — a hospital can't verify itself.
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
