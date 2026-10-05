import { useNavigate } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { setDoctorFavoriteFn, setHospitalFavoriteFn } from "@/lib/favorites/functions";
import { cn } from "@/lib/utils";

type ViewerRole = "PATIENT" | "DOCTOR" | "HOSPITAL_ADMIN" | "ADMIN" | null;

/**
 * Favorite toggle. The server (PostgreSQL) is the only source of truth:
 * `initial` comes from the same query that rendered the card, and every click
 * sends the DESIRED state to an idempotent server function. No localStorage.
 *
 *  - Signed-out visitor: clicking goes to /login (never pretends to succeed).
 *  - Non-patient roles: the control isn't rendered.
 *  - In-flight guard: rapid double-clicks cannot fire overlapping requests
 *    (and even if they did, the DB unique pair + ON CONFLICT DO NOTHING
 *    means no duplicate rows).
 */
export function FavoriteButton({
  kind,
  id,
  initial,
  viewerRole,
  withLabel = false,
  className,
}: {
  kind: "doctor" | "hospital";
  id: string;
  initial: boolean | null;
  viewerRole: ViewerRole;
  withLabel?: boolean;
  className?: string;
}) {
  const navigate = useNavigate();
  const [value, setValue] = useState(initial === true);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => setValue(initial === true), [initial]);

  if (viewerRole !== null && viewerRole !== "PATIENT") return null;

  async function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (viewerRole === null) {
      void navigate({ to: "/login" });
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      const next = !value;
      const res =
        kind === "doctor"
          ? await setDoctorFavoriteFn({ data: { doctorId: id, favorite: next } })
          : await setHospitalFavoriteFn({ data: { hospitalId: id, favorite: next } });
      if (res.ok) setValue(res.favorite);
      else toast.error(res.message);
    } catch {
      toast.error("Couldn't update your favorites. Please try again.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  const label = value ? "Remove from favorites" : "Add to favorites";
  return (
    <Button
      type="button"
      variant="outline"
      size={withLabel ? "sm" : "icon"}
      onClick={onClick}
      disabled={pending}
      aria-pressed={value}
      aria-label={label}
      title={viewerRole === null ? "Sign in to save favorites" : label}
      className={cn("shrink-0", className)}
    >
      <Heart
        className={cn("size-4", value && "fill-destructive text-destructive")}
        aria-hidden="true"
      />
      {withLabel && <span>{value ? "Saved" : "Save"}</span>}
    </Button>
  );
}
