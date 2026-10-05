import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPasswordFn } from "@/lib/auth/functions";
import { resetPasswordSchema } from "@/lib/validation/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reset-password")({
  validateSearch: z.object({ token: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Choose a new Medix password" },
      {
        name: "description",
        content: "Set a new password for your Medix account and get back to managing your care.",
      },
      { property: "og:title", content: "Choose a new Medix password" },
      { property: "og:description", content: "Set a new password for your Medix account." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { token } = Route.useSearch();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const rules = [
    { label: "At least 10 characters", ok: password.length >= 10 },
    { label: "Contains a number", ok: /\d/.test(password) },
    { label: "Contains an uppercase letter", ok: /[A-Z]/.test(password) },
    { label: "Contains a lowercase letter", ok: /[a-z]/.test(password) },
  ];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!token) {
      setFormError("This password reset link is missing its token. Request a new one.");
      return;
    }

    const parsed = resetPasswordSchema.safeParse({
      token,
      password,
      confirmPassword: confirm,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "password") next["password"] = issue.message;
        if (key === "confirmPassword") next["confirm"] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setIsSubmitting(true);

    try {
      const result = await resetPasswordFn({ data: parsed.data });
      if (!result.ok) {
        setFormError(result.message);
        return;
      }
      await navigate({ to: "/login" });
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Choose a new password"
      description="Pick something you haven't used on Medix before."
      footer={
        <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Back to sign in
        </Link>
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

        <div className="space-y-2">
          <Label htmlFor="np">New password</Label>
          <div className="relative">
            <Input
              id="np"
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(errors["password"])}
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
          <ul className="space-y-1 pt-1">
            {rules.map((r) => (
              <li
                key={r.label}
                className={cn(
                  "flex items-center gap-2 text-xs",
                  r.ok ? "text-success" : "text-muted-foreground",
                )}
              >
                <Check className="size-3.5" aria-hidden="true" />
                {r.label}
              </li>
            ))}
          </ul>
          {errors["password"] && (
            <p className="text-sm text-destructive" role="alert">
              {errors["password"]}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="cp">Confirm new password</Label>
          <Input
            id="cp"
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={Boolean(errors["confirm"])}
          />
          {errors["confirm"] && (
            <p className="text-sm text-destructive" role="alert">
              {errors["confirm"]}
            </p>
          )}
        </div>

        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
          {isSubmitting ? "Updating..." : "Update password"}
        </Button>
      </form>
    </AuthShell>
  );
}
