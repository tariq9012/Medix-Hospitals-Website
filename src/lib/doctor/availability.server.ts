import "@tanstack/react-start/server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { doctorAvailability, type DoctorAvailability } from "@/db/schema";
import { isHospitalValidForDoctor } from "@/lib/appointments/queries.server";
import { AppointmentError } from "@/lib/appointments/errors";
import { recordAuthAuditEvent } from "@/lib/auth/audit.server";
import type {
  CreateAvailabilityRuleInput,
  UpdateAvailabilityRuleInput,
} from "@/lib/validation/doctor";

/**
 * `doctor_availability` is the *only* source of bookable-slot truth — the
 * exact same rows this module writes are read by
 * `src/lib/appointments/availability.server.ts` (Phase 4's slot generator).
 * There is no separate/duplicate scheduling table or logic, so a change
 * made here is immediately visible to patients booking.
 *
 * Deleting or disabling a rule never touches `appointments` — the two
 * tables aren't linked by a foreign key, so already-booked appointments are
 * structurally unaffected by any availability edit.
 */

export async function listDoctorAvailability(doctorId: string): Promise<DoctorAvailability[]> {
  return db
    .select()
    .from(doctorAvailability)
    .where(eq(doctorAvailability.doctorId, doctorId))
    .orderBy(doctorAvailability.dayOfWeek, doctorAvailability.startTime);
}

async function assertHospitalOwnership(doctorId: string, hospitalId: string | undefined) {
  if (!hospitalId) return;
  const valid = await isHospitalValidForDoctor(doctorId, hospitalId);
  if (!valid) {
    throw new AppointmentError("That location isn't associated with your account.");
  }
}

export async function createAvailabilityRule(
  doctorId: string,
  actorUserId: string,
  input: CreateAvailabilityRuleInput,
): Promise<DoctorAvailability> {
  await assertHospitalOwnership(doctorId, input.hospitalId);

  const [created] = await db
    .insert(doctorAvailability)
    .values({
      doctorId,
      hospitalId: input.hospitalId,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      slotDurationMinutes: input.slotDurationMinutes,
      consultationType: input.consultationType,
      breakStartTime: input.breakStartTime,
      breakEndTime: input.breakEndTime,
    })
    .returning();

  if (!created) throw new AppointmentError("Could not create the availability rule.");

  await recordAuthAuditEvent({
    actorUserId,
    action: "DOCTOR_AVAILABILITY_CREATED",
    entityId: created.id,
    metadata: { dayOfWeek: input.dayOfWeek, startTime: input.startTime, endTime: input.endTime },
  });

  return created;
}

async function getOwnedRule(doctorId: string, ruleId: string): Promise<DoctorAvailability | null> {
  const [rule] = await db
    .select()
    .from(doctorAvailability)
    .where(and(eq(doctorAvailability.id, ruleId), eq(doctorAvailability.doctorId, doctorId)))
    .limit(1);
  return rule ?? null;
}

export async function updateAvailabilityRule(
  doctorId: string,
  actorUserId: string,
  input: UpdateAvailabilityRuleInput,
): Promise<DoctorAvailability> {
  const existing = await getOwnedRule(doctorId, input.ruleId);
  if (!existing) throw new AppointmentError("Availability rule not found.");

  if (input.patch.hospitalId) {
    await assertHospitalOwnership(doctorId, input.patch.hospitalId);
  }

  const [updated] = await db
    .update(doctorAvailability)
    .set({ ...input.patch, updatedAt: new Date() })
    .where(and(eq(doctorAvailability.id, input.ruleId), eq(doctorAvailability.doctorId, doctorId)))
    .returning();

  if (!updated) throw new AppointmentError("Could not update the availability rule.");

  await recordAuthAuditEvent({
    actorUserId,
    action: "DOCTOR_AVAILABILITY_UPDATED",
    entityId: updated.id,
    metadata: { changedFields: Object.keys(input.patch) },
  });

  return updated;
}

/** Enable/disable a rule — the preferred, non-destructive way to take a slot out of rotation. */
export async function toggleAvailabilityRule(
  doctorId: string,
  actorUserId: string,
  ruleId: string,
  isActive: boolean,
): Promise<DoctorAvailability> {
  const existing = await getOwnedRule(doctorId, ruleId);
  if (!existing) throw new AppointmentError("Availability rule not found.");

  const [updated] = await db
    .update(doctorAvailability)
    .set({ isActive, updatedAt: new Date() })
    .where(and(eq(doctorAvailability.id, ruleId), eq(doctorAvailability.doctorId, doctorId)))
    .returning();

  if (!updated) throw new AppointmentError("Could not update the availability rule.");

  await recordAuthAuditEvent({
    actorUserId,
    action: "DOCTOR_AVAILABILITY_DISABLED",
    entityId: updated.id,
    metadata: { isActive },
  });

  return updated;
}

/**
 * Hard-deletes a rule. Since `doctor_availability` has no foreign-key
 * relationship to `appointments`, this can never remove or orphan an
 * existing booked appointment — only future slot *generation* is affected.
 */
export async function deleteAvailabilityRule(
  doctorId: string,
  actorUserId: string,
  ruleId: string,
): Promise<void> {
  const existing = await getOwnedRule(doctorId, ruleId);
  if (!existing) throw new AppointmentError("Availability rule not found.");

  await db
    .delete(doctorAvailability)
    .where(and(eq(doctorAvailability.id, ruleId), eq(doctorAvailability.doctorId, doctorId)));

  await recordAuthAuditEvent({
    actorUserId,
    action: "DOCTOR_AVAILABILITY_DISABLED",
    entityId: ruleId,
    metadata: { deleted: true },
  });
}
