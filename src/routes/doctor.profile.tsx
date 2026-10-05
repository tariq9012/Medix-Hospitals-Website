import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader, VerifiedBadge } from "@/components/common";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { Doctor } from "@/db/schema";
import { getMyDoctorProfileFn, updateDoctorProfileFn } from "@/lib/doctor/functions";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";

export const Route = createFileRoute("/doctor/profile")({
  beforeLoad: requireRoleBeforeLoad("DOCTOR"),
  head: () => ({
    meta: [
      { title: "Profile — Medix" },
      { name: "description", content: "Manage your public doctor profile and credentials." },
    ],
  }),
  component: DoctorProfilePage,
});

function DoctorProfilePage() {
  const { user } = Route.useRouteContext();
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    biography: "",
    yearsOfExperience: "",
    profileImage: "",
    consultationFee: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyDoctorProfileFn().then((d) => {
      setDoctor(d);
      setForm({
        firstName: d.firstName,
        lastName: d.lastName,
        biography: d.biography ?? "",
        yearsOfExperience: d.yearsOfExperience?.toString() ?? "",
        profileImage: d.profileImage ?? "",
        consultationFee: d.consultationFee ?? "",
      });
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const result = await updateDoctorProfileFn({
        data: {
          firstName: form.firstName,
          lastName: form.lastName,
          biography: form.biography || undefined,
          yearsOfExperience: form.yearsOfExperience ? Number(form.yearsOfExperience) : undefined,
          profileImage: form.profileImage,
          consultationFee: Number(form.consultationFee),
        },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success("Profile updated.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <DashboardLayout role="doctor" user={{ name: user.displayName, subtitle: "Doctor account" }}>
      <PageHeader title="Profile" description="Manage your public doctor profile." />

      {!doctor ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Card>
            <CardContent className="p-6">
              <form className="space-y-5" onSubmit={submit}>
                {error && (
                  <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                  </p>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First name</Label>
                    <Input
                      id="firstName"
                      value={form.firstName}
                      onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last name</Label>
                    <Input
                      id="lastName"
                      value={form.lastName}
                      onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bio">Biography</Label>
                  <Textarea
                    id="bio"
                    rows={4}
                    value={form.biography}
                    onChange={(e) => setForm({ ...form, biography: e.target.value })}
                    placeholder="A short summary patients see on your public profile."
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="experience">Years of experience</Label>
                    <Input
                      id="experience"
                      type="number"
                      min={0}
                      max={80}
                      value={form.yearsOfExperience}
                      onChange={(e) => setForm({ ...form, yearsOfExperience: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fee">Consultation fee (PKR)</Label>
                    <Input
                      id="fee"
                      type="number"
                      min={0}
                      value={form.consultationFee}
                      onChange={(e) => setForm({ ...form, consultationFee: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Applies to future bookings only — appointments already booked keep their
                      original fee.
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="image">Profile image URL</Label>
                  <Input
                    id="image"
                    value={form.profileImage}
                    onChange={(e) => setForm({ ...form, profileImage: e.target.value })}
                    placeholder="https://…"
                  />
                </div>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? "Saving…" : "Save changes"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-6">
              <h3 className="font-semibold">Account status</h3>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Verification</span>
                {doctor.verificationStatus === "APPROVED" ? (
                  <VerifiedBadge />
                ) : (
                  <Badge variant="secondary" className="capitalize">
                    {doctor.verificationStatus.toLowerCase()}
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Medical license</span>
                <span className="font-medium">{doctor.medicalLicenseNumber ?? "Not on file"}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Rating</span>
                <span className="font-medium">
                  {doctor.totalReviews > 0
                    ? `${doctor.rating} (${doctor.totalReviews} reviews)`
                    : "No reviews yet"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Verification status, medical license number, and rating can't be edited here —
                they're set by Medix's admin verification process.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </DashboardLayout>
  );
}
