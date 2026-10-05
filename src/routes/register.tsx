import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Building2, Eye, EyeOff, Stethoscope, User } from "lucide-react";
import { useState } from "react";

import { AuthShell } from "@/components/auth/AuthShell";
import { SocialButtons } from "@/components/auth/SocialButtons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerFn } from "@/lib/auth/functions";
import { cn } from "@/lib/utils";
import { registerSchema, type SelfRegisterableRole } from "@/lib/validation/auth";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Create your Medix account" },
      {
        name: "description",
        content:
          "Join Medix as a patient, doctor or hospital. Book appointments, manage schedules and keep medical records in one place.",
      },
      { property: "og:title", content: "Create your Medix account" },
      {
        property: "og:description",
        content: "Sign up as a patient, doctor or hospital team.",
      },
    ],
  }),
  component: RegisterPage,
});

const roles = [
  { v: "PATIENT" as const, icon: User, label: "Patient", text: "Book care and keep your records" },
  { v: "DOCTOR" as const, icon: Stethoscope, label: "Doctor", text: "Manage clinics and patients" },
  {
    v: "HOSPITAL_ADMIN" as const,
    icon: Building2,
    label: "Hospital / Staff",
    text: "Run departments and beds",
  },
];

function RegisterPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState<SelfRegisterableRole>("PATIENT");
  const [values, setValues] = useState({ name: "", email: "", phone: "", password: "" });
  const [terms, setTerms] = useState(false);
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!terms) {
      setErrors({ terms: "Please accept the terms to continue." });
      return;
    }

    const [firstName, ...rest] = values.name.trim().split(/\s+/);
    const lastName = rest.join(" ");

    const parsed = registerSchema.safeParse({
      role,
      firstName: firstName ?? "",
      lastName: lastName || (firstName ?? ""),
      phone: values.phone || undefined,
      email: values.email,
      password: values.password,
      confirmPassword: values.password,
    });

    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "firstName" || key === "lastName") next["name"] = "Enter your full name.";
        else if (typeof key === "string") next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setIsSubmitting(true);

    try {
      const result = await registerFn({ data: parsed.data });
      if (!result.ok) {
        setFormError(result.message);
        return;
      }
      await navigate({ to: result.dashboardPath });
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      description="One account for appointments, prescriptions, reports and messages."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form className="space-y-5" onSubmit={submit} noValidate>
        {formError && (
          <p
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {formError}
          </p>
        )}

        <fieldset>
          <legend className="mb-2 text-sm font-medium">I am joining as</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {roles.map((r) => (
              <button
                key={r.v}
                type="button"
                onClick={() => setRole(r.v)}
                aria-pressed={role === r.v}
                className={cn(
                  "rounded-xl border p-3 text-left transition-colors",
                  role === r.v
                    ? "border-primary bg-primary-soft"
                    : "border-border hover:bg-surface",
                )}
              >
                <r.icon className="size-5 text-primary" aria-hidden="true" />
                <span className="mt-2 block text-sm font-medium">{r.label}</span>
                <span className="block text-xs text-muted-foreground">{r.text}</span>
              </button>
            ))}
          </div>
          {(role === "DOCTOR" || role === "HOSPITAL_ADMIN") && (
            <p className="mt-2 text-xs text-muted-foreground">
              Provider accounts require verification before full access is granted. You can sign in
              right away, but some actions stay locked until an admin approves your account.
            </p>
          )}
        </fieldset>

        <div className="space-y-2">
          <Label htmlFor="r-name">Full name</Label>
          <Input
            id="r-name"
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

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="r-email">Email address</Label>
            <Input
              id="r-email"
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
          <div className="space-y-2">
            <Label htmlFor="r-phone">Phone number</Label>
            <Input
              id="r-phone"
              value={values.phone}
              onChange={(e) => setValues({ ...values, phone: e.target.value })}
              aria-invalid={Boolean(errors["phone"])}
            />
            {errors["phone"] && (
              <p className="text-sm text-destructive" role="alert">
                {errors["phone"]}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="r-password">Password</Label>
          <div className="relative">
            <Input
              id="r-password"
              type={show ? "text" : "password"}
              value={values.password}
              onChange={(e) => setValues({ ...values, password: e.target.value })}
              aria-invalid={Boolean(errors["password"])}
              aria-describedby="pw-help"
              className="pr-11"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground"
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <p id="pw-help" className="text-xs text-muted-foreground">
            At least 10 characters, with an uppercase letter, a lowercase letter and a number.
          </p>
          {errors["password"] && (
            <p className="text-sm text-destructive" role="alert">
              {errors["password"]}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-start gap-2">
            <Checkbox
              id="terms"
              checked={terms}
              onCheckedChange={(c) => setTerms(c === true)}
              className="mt-0.5"
            />
            <Label htmlFor="terms" className="font-normal leading-snug">
              I agree to the{" "}
              <Link to="/terms" className="text-primary underline-offset-4 hover:underline">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link to="/privacy" className="text-primary underline-offset-4 hover:underline">
                Privacy Policy
              </Link>
              .
            </Label>
          </div>
          {errors["terms"] && (
            <p className="text-sm text-destructive" role="alert">
              {errors["terms"]}
            </p>
          )}
        </div>

        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
          {isSubmitting ? "Creating account..." : "Create account"}
        </Button>

        <SocialButtons />
      </form>
    </AuthShell>
  );
}
