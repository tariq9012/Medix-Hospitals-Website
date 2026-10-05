import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  to = "/",
  label = "Medix",
}: {
  className?: string;
  to?: string;
  label?: string;
}) {
  return (
    <Link
      to={to}
      className={cn("inline-flex items-center gap-2.5 font-display", className)}
      aria-label="Medix home"
    >
      <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-soft">
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true" fill="none">
          <path
            d="M12 3.5c2.2-2 6.5-1.3 7.7 1.7 1.4 3.4-1.6 7-7.7 12.3C5.9 12.2 2.9 8.6 4.3 5.2 5.5 2.2 9.8 1.5 12 3.5Z"
            fill="currentColor"
            opacity="0.25"
          />
          <path
            d="M3 13.2h4l1.6-3.4 2.6 6.2 2-4.1 1.3 1.3H21"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="text-lg font-bold tracking-tight text-foreground">{label}</span>
    </Link>
  );
}
