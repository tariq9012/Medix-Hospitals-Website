import "@tanstack/react-start/server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { doctors, type Doctor } from "@/db/schema";
import { AppointmentError } from "@/lib/appointments/errors";
import { recordAuthAuditEvent } from "@/lib/auth/audit.server";
import type { UpdateDoctorProfileInput } from "@/lib/validation/doctor";

/**
 * Only the fields listed in `UpdateDoctorProfileInput` are ever written
 * here — `medicalLicenseNumber`, `verificationStatus`, `slug`, `rating`,
 * and `totalReviews` are structurally impossible to reach through this
 * function, regardless of what a crafted request body contains, since the
 * `.set()` call below only spreads validated, explicitly-named fields.
 */
export async function updateDoctorProfile(
  doctorId: string,
  actorUserId: string,
  input: UpdateDoctorProfileInput,
): Promise<Doctor> {
  const [updated] = await db
    .update(doctors)
    .set({
      firstName: input.firstName,
      lastName: input.lastName,
      biography: input.biography,
      yearsOfExperience: input.yearsOfExperience,
      profileImage: input.profileImage || null,
      consultationFee: input.consultationFee.toFixed(2),
      updatedAt: new Date(),
    })
    .where(eq(doctors.id, doctorId))
    .returning();

  if (!updated) throw new AppointmentError("Could not update your profile.");

  await recordAuthAuditEvent({
    actorUserId,
    action: "DOCTOR_PROFILE_UPDATED",
    entityId: updated.id,
    metadata: { fields: Object.keys(input) },
  });

  return updated;
}
