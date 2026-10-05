import { createFileRoute, Link } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";
import { useState } from "react";

import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordFn } from "@/lib/auth/functions";
import { forgotPasswordSchema } from "@/lib/validation/auth";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset your Medix password" },
      {
        name: "description",
        content:
          "Enter your email address and we'll send a secure link to reset your Medix password.",
      },
      { property: "og:title", content: "Reset your Medix password" },
      { property: "og:description", content: "Request a secure password reset link." },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid email address.");
      return;
    }
    setError("");
    setIsSubmitting(true);
    try {
      const result = await forgotPasswordFn({ data: parsed.data });
      if (!result.ok) {
        // Only rate-limit errors surface here — the flow itself never
        // reveals whether an account exists.
        setError(result.message);
        return;
      }
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Forgot your password?"
      description="We'll email you a secure link to choose a new one."
      footer={
        <>
          Remembered it?{" "}
          <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </>
      }
    >
      {sent ? (
        <div className="space-y-4 rounded-xl border border-border bg-card p-6 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-success/15 text-success">
            <MailCheck className="size-6" aria-hidden="true" />
          </span>
          <h2 className="font-semibold">Check your inbox</h2>
          <p className="text-sm text-muted-foreground">
            If an account exists for {email}, a reset link is on its way. The link expires in 30
            minutes.
          </p>
          <Button asChild className="w-full">
            <Link to="/reset-password">Open reset link (demo)</Link>
          </Button>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={submit} noValidate>
          <div className="space-y-2">
            <Label htmlFor="fp-email">Email address</Label>
            <Input
              id="fp-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(error)}
              placeholder="you@example.com"
            />
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
          <Button type="submit" className="w-full" size="lg">
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
