import { Link } from "@tanstack/react-router";
import { Banknote, Building2, Clock, MapPin, Video } from "lucide-react";

import { FavoriteButton } from "@/components/directory/FavoriteButton";
import { RatingSummary, VerifiedBadge } from "@/components/common";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { PublicDoctorCard } from "@/lib/directory/types";
import { formatPKR, initialsOf } from "@/lib/format";

type ViewerRole = "PATIENT" | "DOCTOR" | "HOSPITAL_ADMIN" | "ADMIN" | null;

/** Renders a PublicDoctorCard DTO. Every field is real; missing ones are simply omitted. */
export function DoctorCard({
  doctor,
  viewerRole,
  compact = false,
}: {
  doctor: PublicDoctorCard;
  viewerRole: ViewerRole;
  compact?: boolean;
}) {
  const primaryHospital = doctor.hospitals.find((h) => h.isPrimary) ?? doctor.hospitals[0];
  const extraSpecialties = doctor.specialties.length - 1;
  return (
    <Card className="group h-full transition-shadow hover:shadow-lift">
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-start gap-4">
          <Avatar className="size-16 shrink-0 rounded-2xl">
            {doctor.profileImage && <AvatarImage src={doctor.profileImage} alt="" />}
            <AvatarFallback className="rounded-2xl bg-primary-soft text-lg font-semibold text-primary">
              {initialsOf(doctor.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-semibold">
                <Link to="/doctors/$id" params={{ id: doctor.slug }} className="hover:underline">
                  {doctor.name}
                </Link>
              </h3>
              <VerifiedBadge />
            </div>
            {doctor.primarySpecialty && (
              <p className="text-sm text-primary">
                {doctor.primarySpecialty}
                {extraSpecialties > 0 && (
                  <span className="text-muted-foreground"> +{extraSpecialties}</span>
                )}
              </p>
            )}
            {doctor.qualifications.length > 0 && (
              <p className="truncate text-xs text-muted-foreground">
                {doctor.qualifications.slice(0, 3).join(", ")}
              </p>
            )}
            <div className="mt-1.5">
              <RatingSummary rating={doctor.rating} reviewCount={doctor.reviewCount} />
            </div>
          </div>
          <FavoriteButton
            kind="doctor"
            id={doctor.id}
            initial={doctor.isFavorite}
            viewerRole={viewerRole}
          />
        </div>

        {!compact && (
          <ul className="grid gap-2 text-sm text-muted-foreground">
            {doctor.yearsOfExperience !== null && (
              <li className="flex items-center gap-2">
                <Clock className="size-4 text-primary" aria-hidden="true" />
                {doctor.yearsOfExperience} years experience
              </li>
            )}
            {primaryHospital && (
              <li className="flex items-center gap-2">
                <Building2 className="size-4 text-primary" aria-hidden="true" />
                <span className="truncate">
                  {primaryHospital.name}
                  {doctor.hospitals.length > 1 && ` +${doctor.hospitals.length - 1} more`}
                </span>
              </li>
            )}
            {primaryHospital?.city && (
              <li className="flex items-center gap-2">
                <MapPin className="size-4 text-primary" aria-hidden="true" />
                {primaryHospital.city}
              </li>
            )}
            {doctor.consultationFee !== null && (
              <li className="flex items-center gap-2">
                <Banknote className="size-4 text-primary" aria-hidden="true" />
                {formatPKR(doctor.consultationFee)} consultation fee
              </li>
            )}
          </ul>
        )}

        <div className="flex flex-wrap gap-2">
          {doctor.modes.includes("ONLINE") && (
            <Badge variant="outline" className="gap-1 border-success/30 bg-success/10 text-success">
              <Video className="size-3" aria-hidden="true" /> Online
            </Badge>
          )}
          {doctor.modes.includes("IN_PERSON") && <Badge variant="secondary">In-person</Badge>}
          {!doctor.hasSchedule && (
            <Badge variant="outline" className="border-border text-muted-foreground">
              No open schedule yet
            </Badge>
          )}
        </div>

        <div className="mt-auto grid grid-cols-2 gap-2 pt-1">
          <Button variant="outline" asChild>
            <Link to="/doctors/$id" params={{ id: doctor.slug }}>
              View Profile
            </Link>
          </Button>
          <Button asChild>
            <Link to="/book" search={{ doctor: doctor.id }}>
              Book
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
