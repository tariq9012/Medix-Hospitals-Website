import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/Logo";

export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-5 py-8 sm:px-10">
        <Logo />
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-sm text-muted-foreground">{footer}</div>}
        </div>
        <p className="text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            Back to Medix
          </Link>{" "}
          · Demo only — no real account is created.
        </p>
      </div>

      <aside className="relative hidden lg:block">
        <img
          src="/images/hero-care.jpg"
          alt="Medix clinicians reviewing a patient chart"
          className="size-full object-cover"
        />
        <div className="absolute inset-0 bg-primary/70" aria-hidden="true" />
        <div className="absolute inset-x-0 bottom-0 p-10 text-primary-foreground">
          <ShieldCheck className="size-8" aria-hidden="true" />
          <p className="mt-4 max-w-sm font-display text-2xl font-bold leading-snug">
            Verified doctors, one calm place for every appointment and record.
          </p>
          <p className="mt-3 max-w-sm text-sm opacity-90">
            Every doctor and hospital on Medix is reviewed and verified before it is listed.
          </p>
        </div>
      </aside>
    </div>
  );
}
