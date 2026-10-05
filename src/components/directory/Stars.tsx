import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

/** Read-only star row for a whole-number rating (individual reviews are integers 1–5). */
export function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      role="img"
      aria-label={`${value} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            "size-4",
            n <= value ? "fill-warning text-warning" : "text-muted-foreground/40",
          )}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

/** Accessible 1–5 picker. */
export function StarInput({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Rating" className="inline-flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          disabled={disabled}
          onClick={() => onChange(n)}
          className="rounded p-0.5 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
        >
          <Star
            className={cn(
              "size-7 transition-colors",
              n <= value
                ? "fill-warning text-warning"
                : "text-muted-foreground/40 hover:text-warning",
            )}
            aria-hidden="true"
          />
        </button>
      ))}
    </div>
  );
}

export function RatingBreakdown({
  breakdown,
  total,
}: {
  breakdown: Record<1 | 2 | 3 | 4 | 5, number>;
  total: number;
}) {
  if (total === 0) return null;
  return (
    <ul className="space-y-1.5" aria-label="Rating breakdown">
      {([5, 4, 3, 2, 1] as const).map((n) => (
        <li key={n} className="flex items-center gap-2 text-xs">
          <span className="w-10 text-muted-foreground">{n} star</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-warning"
              style={{ width: `${(breakdown[n] / total) * 100}%` }}
            />
          </span>
          <span className="w-6 text-right text-muted-foreground">{breakdown[n]}</span>
        </li>
      ))}
    </ul>
  );
}
