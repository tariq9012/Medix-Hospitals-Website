import { z } from "zod";

import { idSchema } from "./common";

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO date (YYYY-MM-DD).")
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00`).getTime()), {
    message: "Invalid date.",
  });

/**
 * A vitals snapshot. Every field is optional and free-text/number so the
 * form never blocks on a vital the doctor didn't measure — but each field
 * has a sane length/range ceiling so this can never become a dumping ground
 * for arbitrary clinical prose.
 */
export const vitalsSchema = z
  .object({
    bloodPressure: z.string().trim().max(20).optional(),
    heartRate: z.string().trim().max(20).optional(),
    temperature: z.string().trim().max(20).optional(),
    respiratoryRate: z.string().trim().max(20).optional(),
    weight: z.string().trim().max(20).optional(),
    height: z.string().trim().max(20).optional(),
    oxygenSaturation: z.string().trim().max(20).optional(),
  })
  .partial()
  .optional();

/**
 * Input for creating a medical record. Deliberately has no `patientId`,
 * `doctorId`, or `hospitalId` field — all three are always derived
 * server-side from the authenticated doctor's session and the appointment
 * itself (see `src/lib/clinical/authorization.server.ts`), never accepted
 * from the client.
 */
export const createMedicalRecordSchema = z.object({
  appointmentId: idSchema,
  chiefComplaint: z.string().trim().max(500).optional(),
  symptoms: z.array(z.string().trim().min(1).max(150)).max(30).optional(),
  diagnosis: z.string().trim().min(1, "Diagnosis is required.").max(1000),
  clinicalNotes: z.string().trim().max(4000).optional(),
  allergies: z.array(z.string().trim().min(1).max(150)).max(30).optional(),
  vitals: vitalsSchema,
  treatmentPlan: z.string().trim().max(2000).optional(),
  treatmentNotes: z.string().trim().max(2000).optional(),
  followUpInstructions: z.string().trim().max(1000).optional(),
  followUpDate: isoDateSchema.optional(),
});

export const updateMedicalRecordSchema = createMedicalRecordSchema
  .omit({ appointmentId: true })
  .partial()
  .extend({ recordId: idSchema });

export const medicalRecordIdSchema = z.object({ recordId: idSchema });

/** A single medication line item within a prescription. */
export const prescriptionItemSchema = z.object({
  medicineName: z
    .string()
    .trim()
    .min(2, "Medicine name must be at least 2 characters.")
    .max(200, "Medicine name is too long."),
  dosage: z.string().trim().max(100).optional(),
  frequency: z.string().trim().max(100).optional(),
  duration: z.string().trim().max(100).optional(),
  route: z.string().trim().max(50).optional(),
  instructions: z.string().trim().max(500).optional(),
});

/**
 * Input for creating a prescription. As with medical records, patient,
 * doctor, and hospital identity are always derived server-side from the
 * appointment — never accepted here. At least one valid medication item is
 * required; empty/nonsensical items are rejected by `prescriptionItemSchema`
 * before they ever reach the database.
 */
export const createPrescriptionSchema = z.object({
  appointmentId: idSchema,
  medicalRecordId: idSchema.optional(),
  notes: z.string().trim().max(1000).optional(),
  items: z
    .array(prescriptionItemSchema)
    .min(1, "At least one medication item is required.")
    .max(20, "A single prescription can't have more than 20 items."),
});

export const updatePrescriptionSchema = z.object({
  prescriptionId: idSchema,
  notes: z.string().trim().max(1000).optional(),
  items: z
    .array(prescriptionItemSchema)
    .min(1, "At least one medication item is required.")
    .max(20, "A single prescription can't have more than 20 items.")
    .optional(),
});

export const prescriptionIdSchema = z.object({ prescriptionId: idSchema });

/**
 * The only prescription status transition modeled in Phase 8 — the current
 * schema (`prescription_status` enum) only has ACTIVE/COMPLETED, so that's
 * the only transition implemented here. If a CANCELLED/voided state is
 * added to the schema later, its transition belongs here too.
 */
export const completePrescriptionSchema = z.object({ prescriptionId: idSchema });

export type CreateMedicalRecordInput = z.infer<typeof createMedicalRecordSchema>;
export type UpdateMedicalRecordInput = z.infer<typeof updateMedicalRecordSchema>;
export type CreatePrescriptionInput = z.infer<typeof createPrescriptionSchema>;
export type UpdatePrescriptionInput = z.infer<typeof updatePrescriptionSchema>;
export type PrescriptionItemInput = z.infer<typeof prescriptionItemSchema>;
