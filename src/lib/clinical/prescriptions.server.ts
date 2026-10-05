import "@tanstack/react-start/server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { medicalRecords, prescriptionItems, prescriptions, type Prescription } from "@/db/schema";
import { recordAuthAuditEvent } from "@/lib/auth/audit.server";
import { createNotification } from "@/lib/notifications/service.server";
import type { CreatePrescriptionInput, UpdatePrescriptionInput } from "@/lib/validation/clinical";

import { requireCompletedOwnedAppointment } from "./authorization.server";
import { ClinicalError } from "./errors";
import type { PrescriptionWithItems } from "./queries.server";

/**
 * Creates a prescription with one or more medication items, atomically.
 * Patient and hospital identity are derived from the doctor's own completed
 * appointment — never accepted from the client. If `medicalRecordId` is
 * supplied, it must belong to this doctor and this same appointment,
 * preserving the intended chain: completed appointment -> medical record ->
 * prescription.
 *
 * The header row and every item are written in a single transaction, so a
 * prescription can never end up partially saved (header with zero items,
 * or items pointing at a header that failed to commit).
 */
export async function createPrescription(
  doctorId: string,
  actorUserId: string,
  input: CreatePrescriptionInput,
): Promise<PrescriptionWithItems> {
  const appointment = await requireCompletedOwnedAppointment(doctorId, input.appointmentId);

  if (input.medicalRecordId) {
    const [record] = await db
      .select({ id: medicalRecords.id })
      .from(medicalRecords)
      .where(
        and(
          eq(medicalRecords.id, input.medicalRecordId),
          eq(medicalRecords.doctorId, doctorId),
          eq(medicalRecords.appointmentId, appointment.id),
        ),
      )
      .limit(1);
    if (!record) {
      throw new ClinicalError("That medical record doesn't belong to this appointment.");
    }
  }

  const result = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(prescriptions)
      .values({
        patientId: appointment.patientId,
        doctorId,
        appointmentId: appointment.id,
        medicalRecordId: input.medicalRecordId,
        hospitalId: appointment.hospitalId,
        notes: input.notes,
        status: "ACTIVE",
      })
      .returning();

    if (!created) {
      throw new ClinicalError("Could not create the prescription. Please try again.");
    }

    const items = await tx
      .insert(prescriptionItems)
      .values(
        input.items.map((item) => ({
          prescriptionId: created.id,
          medicineName: item.medicineName,
          dosage: item.dosage,
          frequency: item.frequency,
          duration: item.duration,
          route: item.route,
          instructions: item.instructions,
        })),
      )
      .returning();

    return { ...created, items };
  });

  await recordAuthAuditEvent({
    actorUserId,
    action: "PRESCRIPTION_CREATED",
    entityType: "prescription",
    entityId: result.id,
    metadata: {
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      itemCount: result.items.length,
    },
  });

  await createNotification({
    userId: appointment.patientId,
    type: "PRESCRIPTION_AVAILABLE",
    title: "New prescription",
    message: "Your doctor issued a new prescription for you.",
    metadata: { prescriptionId: result.id, appointmentId: appointment.id },
  });

  return result;
}

/**
 * Replaces a prescription's medication items and/or notes. Only the doctor
 * who issued the prescription may edit it, and only while it's still
 * ACTIVE — a COMPLETED prescription is a closed clinical record, not a
 * draft. The header and the replaced item set are written in one
 * transaction so the prescription is never left with a stale mix of old
 * and new items.
 */
export async function updatePrescription(
  doctorId: string,
  actorUserId: string,
  input: UpdatePrescriptionInput,
): Promise<PrescriptionWithItems> {
  const [existing] = await db
    .select()
    .from(prescriptions)
    .where(and(eq(prescriptions.id, input.prescriptionId), eq(prescriptions.doctorId, doctorId)))
    .limit(1);

  if (!existing) {
    throw new ClinicalError("Prescription not found.");
  }
  if (existing.status !== "ACTIVE") {
    throw new ClinicalError("Only an active prescription can be edited.");
  }

  const result = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(prescriptions)
      .set({
        notes: input.notes ?? existing.notes,
        updatedAt: new Date(),
      })
      .where(and(eq(prescriptions.id, input.prescriptionId), eq(prescriptions.doctorId, doctorId)))
      .returning();

    if (!updated) {
      throw new ClinicalError("Prescription not found.");
    }

    let items = await tx
      .select()
      .from(prescriptionItems)
      .where(eq(prescriptionItems.prescriptionId, updated.id));

    if (input.items) {
      await tx.delete(prescriptionItems).where(eq(prescriptionItems.prescriptionId, updated.id));
      items = await tx
        .insert(prescriptionItems)
        .values(
          input.items.map((item) => ({
            prescriptionId: updated.id,
            medicineName: item.medicineName,
            dosage: item.dosage,
            frequency: item.frequency,
            duration: item.duration,
            route: item.route,
            instructions: item.instructions,
          })),
        )
        .returning();
    }

    return { ...updated, items };
  });

  await recordAuthAuditEvent({
    actorUserId,
    action: "PRESCRIPTION_UPDATED",
    entityType: "prescription",
    entityId: result.id,
    metadata: { appointmentId: result.appointmentId },
  });

  return result;
}

/**
 * The only doctor-initiated prescription status transition modeled in this
 * phase: ACTIVE -> COMPLETED (the current `prescription_status` enum has no
 * other states — see `src/db/schema/enums.ts`). The prior status is
 * included as a guard in the `WHERE` clause so a concurrent transition from
 * another tab can't silently double-apply.
 */
export async function completePrescription(
  doctorId: string,
  actorUserId: string,
  prescriptionId: string,
): Promise<Prescription> {
  const [updated] = await db
    .update(prescriptions)
    .set({ status: "COMPLETED", updatedAt: new Date() })
    .where(
      and(
        eq(prescriptions.id, prescriptionId),
        eq(prescriptions.doctorId, doctorId),
        eq(prescriptions.status, "ACTIVE"),
      ),
    )
    .returning();

  if (!updated) {
    throw new ClinicalError(
      "This prescription can't be marked completed — it may not exist, may not belong to you, or may already be completed.",
    );
  }

  await recordAuthAuditEvent({
    actorUserId,
    action: "PRESCRIPTION_UPDATED",
    entityType: "prescription",
    entityId: updated.id,
    metadata: { transition: "ACTIVE_TO_COMPLETED" },
  });

  return updated;
}
