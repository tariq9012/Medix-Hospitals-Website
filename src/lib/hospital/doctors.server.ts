import "@tanstack/react-start/server-only";

import { and, count, eq, gte, ne } from "drizzle-orm";

import { db } from "@/db";
import { appointments, doctors, hospitalDoctors, hospitals, users } from "@/db/schema";
import { recordAuthAuditEvent } from "@/lib/auth/audit.server";
import type { AffiliateDoctorInput, UpdateHospitalProfileInput } from "@/lib/validation/hospital";

import { HospitalError } from "./queries.server";

function todayLocalDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * Updates the hospital's own profile.
 *
 * Only the fields in `UpdateHospitalProfileInput` are written — a crafted
 * request cannot reach `verificationStatus`, `verificationReason`,
 * `verificationReviewedAt`, or `slug`, because `.set()` below names every
 * column explicitly. A hospital admin therefore cannot self-verify.
 *
 * `slug` is intentionally read-only in this phase: it's the hospital's
 * public URL identity, and letting a verified hospital silently change it
 * (or its legal name) without re-verification is exactly the kind of
 * identity swap that should go through admin review. Name changes are
 * allowed but do NOT currently trigger re-verification — see the Phase 7
 * known limitations.
 */
export async function updateHospitalProfile(
  hospitalId: string,
  actorUserId: string,
  input: UpdateHospitalProfileInput,
) {
  const [updated] = await db
    .update(hospitals)
    .set({
      name: input.name,
      description: input.description,
      phone: input.phone,
      email: input.email || null,
      address: input.address,
      city: input.city,
      country: input.country,
      logo: input.logo || null,
      coverImage: input.coverImage || null,
      latitude: input.latitude != null ? String(input.latitude) : null,
      longitude: input.longitude != null ? String(input.longitude) : null,
      updatedAt: new Date(),
    })
    .where(eq(hospitals.id, hospitalId))
    .returning();

  if (!updated) throw new HospitalError("Could not update the hospital profile.");

  await recordAuthAuditEvent({
    actorUserId,
    action: "HOSPITAL_PROFILE_UPDATED",
    entityId: hospitalId,
    metadata: { fields: Object.keys(input) },
  });

  return updated;
}

/**
 * Affiliates a doctor with this hospital.
 *
 * The doctor must already be APPROVED and ACTIVE — a hospital admin can
 * affiliate an existing verified provider but has no power to change that
 * provider's global verification state, which stays with platform admins.
 */
export async function affiliateDoctor(
  hospitalId: string,
  actorUserId: string,
  input: AffiliateDoctorInput,
) {
  const created = await db.transaction(async (tx) => {
    const [doctor] = await tx
      .select({
        id: doctors.id,
        verificationStatus: doctors.verificationStatus,
        accountStatus: users.status,
      })
      .from(doctors)
      .innerJoin(users, eq(users.id, doctors.userId))
      .where(eq(doctors.id, input.doctorId))
      .limit(1);

    if (!doctor) throw new HospitalError("Doctor not found.");
    if (doctor.verificationStatus !== "APPROVED") {
      throw new HospitalError(
        "Only doctors verified by Medix can be affiliated. Verification is handled by platform admins.",
      );
    }
    if (doctor.accountStatus !== "ACTIVE") {
      throw new HospitalError("This doctor's account isn't active.");
    }

    const [existing] = await tx
      .select({ id: hospitalDoctors.id })
      .from(hospitalDoctors)
      .where(
        and(
          eq(hospitalDoctors.hospitalId, hospitalId),
          eq(hospitalDoctors.doctorId, input.doctorId),
        ),
      )
      .limit(1);

    if (existing) throw new HospitalError("This doctor is already affiliated with your hospital.");

    const [row] = await tx
      .insert(hospitalDoctors)
      .values({ hospitalId, doctorId: input.doctorId, department: input.department })
      .returning();

    return row;
  });

  await recordAuthAuditEvent({
    actorUserId,
    action: "HOSPITAL_DOCTOR_AFFILIATED",
    entityId: hospitalId,
    metadata: { doctorId: input.doctorId },
  });

  return created;
}

/**
 * Removes a doctor's affiliation with this hospital.
 *
 * Refuses while the doctor still has future non-cancelled appointments AT
 * THIS HOSPITAL, rather than silently orphaning patients' bookings. The
 * removal only ever deletes the `hospital_doctors` join row — the doctor,
 * their patients, and every past and future appointment (including the
 * `appointments.hospitalId` reference) are untouched.
 */
export async function removeDoctorAffiliation(
  hospitalId: string,
  actorUserId: string,
  doctorId: string,
) {
  await db.transaction(async (tx) => {
    const [affiliation] = await tx
      .select({ id: hospitalDoctors.id })
      .from(hospitalDoctors)
      .where(
        and(eq(hospitalDoctors.hospitalId, hospitalId), eq(hospitalDoctors.doctorId, doctorId)),
      )
      .limit(1);

    if (!affiliation) throw new HospitalError("This doctor isn't affiliated with your hospital.");

    const [{ value: futureAppointments }] = await tx
      .select({ value: count() })
      .from(appointments)
      .where(
        and(
          eq(appointments.hospitalId, hospitalId),
          eq(appointments.doctorId, doctorId),
          gte(appointments.appointmentDate, todayLocalDateString()),
          ne(appointments.status, "CANCELLED"),
        ),
      );

    if (futureAppointments > 0) {
      throw new HospitalError(
        `This doctor still has ${futureAppointments} upcoming appointment(s) at your hospital. Those must be completed or cancelled before the affiliation can be removed.`,
      );
    }

    await tx.delete(hospitalDoctors).where(eq(hospitalDoctors.id, affiliation.id));
  });

  await recordAuthAuditEvent({
    actorUserId,
    action: "HOSPITAL_DOCTOR_REMOVED",
    entityId: hospitalId,
    metadata: { doctorId },
  });
}
