import { Link } from "@tanstack/react-router";
import { Building2, MapPin, Stethoscope } from "lucide-react";

import { FavoriteButton } from "@/components/directory/FavoriteButton";
import { RatingSummary, VerifiedBadge } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { PublicHospitalCard } from "@/lib/directory/types";

type ViewerRole = "PATIENT" | "DOCTOR" | "HOSPITAL_ADMIN" | "ADMIN" | null;

/** Renders a PublicHospitalCard DTO — real fields only; absent ones are omitted. */
export function HospitalCard({
  hospital,
  viewerRole,
}: {
  hospital: PublicHospitalCard;
  viewerRole: ViewerRole;
}) {
  const image = hospital.coverImage ?? hospital.logo;
  return (
    <Card className="group h-full overflow-hidden transition-shadow hover:shadow-lift">
      {image ? (
        <img
          src={image}
          alt={`${hospital.name}`}
          loading="lazy"
          className="h-44 w-full object-cover"
        />
      ) : (
        <div className="grid h-44 w-full place-items-center bg-primary-soft text-primary">
          <Building2 className="size-10" aria-hidden="true" />
        </div>
      )}
      <CardContent className="flex h-full flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">
              <Link to="/hospitals/$id" params={{ id: hospital.slug }} className="hover:underline">
                {hospital.name}
              </Link>
            </h3>
            <VerifiedBadge />
          </div>
          <FavoriteButton
            kind="hospital"
            id={hospital.id}
            initial={hospital.isFavorite}
            viewerRole={viewerRole}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {hospital.city && (
            <span className="flex items-center gap-1.5">
              <MapPin className="size-4 text-primary" aria-hidden="true" /> {hospital.city}
            </span>
          )}
          <RatingSummary rating={hospital.rating} reviewCount={hospital.reviewCount} />
        </div>
        {hospital.address && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{hospital.address}</p>
        )}
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Stethoscope className="size-4 text-primary" aria-hidden="true" />
          {hospital.doctorCount} {hospital.doctorCount === 1 ? "doctor" : "doctors"}
        </p>
        {hospital.specialties.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {hospital.specialties.slice(0, 4).map((s) => (
              <Badge key={s} variant="secondary">
                {s}
              </Badge>
            ))}
            {hospital.specialties.length > 4 && (
              <Badge variant="outline">+{hospital.specialties.length - 4}</Badge>
            )}
          </div>
        )}
        <div className="mt-auto pt-1">
          <Button variant="outline" className="w-full" asChild>
            <Link to="/hospitals/$id" params={{ id: hospital.slug }}>
              View Hospital
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
