import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Star,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/* ---------------------------------- Page --------------------------------- */

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumbs?: { label: string; to?: string }[];
}) {
  return (
    <div className="mb-6 space-y-3">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {breadcrumbs.map((c, i) => (
              <li key={c.label} className="flex items-center gap-1.5">
                {c.to ? (
                  <Link to={c.to} className="transition-colors hover:text-foreground">
                    {c.label}
                  </Link>
                ) : (
                  <span className="text-foreground">{c.label}</span>
                )}
                {i < breadcrumbs.length - 1 && (
                  <ChevronRight className="size-3" aria-hidden="true" />
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          {description && (
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  align = "left",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  align?: "left" | "center";
}) {
  return (
    <div
      className={cn(
        "mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        align === "center" && "sm:flex-col sm:items-center sm:text-center",
      )}
    >
      <div className={cn("max-w-2xl", align === "center" && "mx-auto")}>
        {eyebrow && (
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            {eyebrow}
          </span>
        )}
        <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
        {description && (
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/* --------------------------------- States -------------------------------- */

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-primary-soft text-primary">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this section. Please try again.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-xl border border-destructive/25 bg-destructive/5 px-6 py-12 text-center"
    >
      <AlertTriangle className="size-8 text-destructive" aria-hidden="true" />
      <h3 className="mt-3 text-base font-semibold">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      {onRetry && (
        <Button variant="outline" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function CardSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-3">
              <Skeleton className="size-14 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-9 w-full rounded-md" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

/* --------------------------------- Pieces -------------------------------- */

export function Rating({
  value,
  reviews,
  size = "sm",
}: {
  value: number;
  reviews?: number;
  size?: "sm" | "md";
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Star
        className={cn("fill-warning text-warning", size === "sm" ? "size-3.5" : "size-4")}
        aria-hidden="true"
      />
      <span className={cn("font-semibold", size === "sm" ? "text-sm" : "text-base")}>
        {value.toFixed(1)}
      </span>
      {reviews !== undefined && (
        <span className="text-xs text-muted-foreground">({reviews} reviews)</span>
      )}
    </span>
  );
}

/** Real-data rating: shows "No reviews yet" instead of a fake 0.0 when there are no visible reviews. */
export function RatingSummary({
  rating,
  reviewCount,
  size = "sm",
}: {
  rating: number | null;
  reviewCount: number;
  size?: "sm" | "md";
}) {
  if (rating === null || reviewCount === 0) {
    return <span className="text-xs text-muted-foreground">No reviews yet</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <Star
        className={cn("fill-warning text-warning", size === "sm" ? "size-3.5" : "size-4")}
        aria-hidden="true"
      />
      <span className={cn("font-semibold", size === "sm" ? "text-sm" : "text-base")}>
        {rating.toFixed(1)}
      </span>
      <span className="text-xs text-muted-foreground">
        ({reviewCount} {reviewCount === 1 ? "review" : "reviews"})
      </span>
    </span>
  );
}

const statusStyles: Record<string, string> = {
  confirmed: "bg-success/12 text-success border-success/25",
  completed: "bg-primary-soft text-primary border-primary/25",
  pending: "bg-warning/15 text-warning-foreground border-warning/35",
  waiting: "bg-warning/15 text-warning-foreground border-warning/35",
  cancelled: "bg-destructive/10 text-destructive border-destructive/25",
  paid: "bg-success/12 text-success border-success/25",
  failed: "bg-destructive/10 text-destructive border-destructive/25",
  refunded: "bg-muted text-muted-foreground border-border",
  approved: "bg-success/12 text-success border-success/25",
  rejected: "bg-destructive/10 text-destructive border-destructive/25",
  active: "bg-success/12 text-success border-success/25",
  inactive: "bg-muted text-muted-foreground border-border",
  available: "bg-success/12 text-success border-success/25",
  occupied: "bg-destructive/10 text-destructive border-destructive/25",
  reserved: "bg-warning/15 text-warning-foreground border-warning/35",
  published: "bg-success/12 text-success border-success/25",
  draft: "bg-muted text-muted-foreground border-border",
  hidden: "bg-muted text-muted-foreground border-border",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const key = status.toLowerCase();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
        statusStyles[key] ?? "bg-muted text-muted-foreground border-border",
        className,
      )}
    >
      {status}
    </span>
  );
}

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = "primary",
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  hint?: string;
  tone?: "primary" | "accent" | "success" | "warning";
}) {
  const tones = {
    primary: "bg-primary-soft text-primary",
    accent: "bg-accent-soft text-accent",
    success: "bg-success/12 text-success",
    warning: "bg-warning/15 text-warning-foreground",
  } as const;

  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1.5 font-display text-2xl font-bold tracking-tight">{value}</p>
          {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", tones[tone])}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
      </CardContent>
    </Card>
  );
}

export function VerifiedBadge() {
  return (
    <Badge
      variant="outline"
      className="border-primary/30 bg-primary-soft text-primary"
      title="Verified by Medix"
    >
      Verified
    </Badge>
  );
}

export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  // Windowed: always first + last, current ±1, with ellipses — stays compact at any page count.
  const wanted = new Set([1, totalPages, page - 1, page, page + 1]);
  const pages = [...wanted].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const items: (number | "gap")[] = [];
  pages.forEach((p, i) => {
    if (i > 0 && p - pages[i - 1]! > 1) items.push("gap");
    items.push(p);
  });
  return (
    <nav className="flex items-center justify-center gap-1.5" aria-label="Pagination">
      <Button
        variant="outline"
        size="icon"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
        aria-label="Previous page"
      >
        <ChevronLeft className="size-4" />
      </Button>
      {items.map((p, i) =>
        p === "gap" ? (
          <span key={`gap-${i}`} className="px-1 text-muted-foreground" aria-hidden="true">
            …
          </span>
        ) : (
          <Button
            key={p}
            variant={p === page ? "default" : "outline"}
            size="icon"
            onClick={() => onChange(p)}
            aria-current={p === page ? "page" : undefined}
            aria-label={`Page ${p}`}
          >
            {p}
          </Button>
        ),
      )}
      <Button
        variant="outline"
        size="icon"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        aria-label="Next page"
      >
        <ChevronRight className="size-4" />
      </Button>
    </nav>
  );
}
