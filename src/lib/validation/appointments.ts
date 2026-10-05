import { z } from "zod";

import { idSchema } from "./common";
import { appointmentStatusSchema, consultationTypeSchema } from "./enums";

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO date (YYYY-MM-DD).")
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00`).getTime()), {
    message: "Invalid date.",
  });

const timeSchema = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Expected HH:MM or HH:MM:SS.");

/** Input for fetching a doctor's available slots on a given date. */
export const slotQuerySchema = z.object({
  doctorId: idSchema,
  hospitalId: idSchema.optional(),
  date: isoDateSchema,
  consultationType: consultationTypeSchema.default("IN_PERSON"),
});

/**
 * Input for creating an appointment (server function input). Deliberately
 * has no `fee` or `endTime` field — both are derived server-side from
 * trusted database data (the doctor's consultation fee and the matching
 * availability rule's slot duration), never accepted from the client.
 */
export const bookAppointmentSchema = z.object({
  doctorId: idSchema,
  hospitalId: idSchema.optional(),
  appointmentDate: isoDateSchema,
  startTime: timeSchema,
  consultationType: consultationTypeSchema,
  reasonForVisit: z
    .string()
    .trim()
    .min(5, "Please describe your reason in at least 5 characters.")
    .max(500),
  patientNotes: z.string().trim().max(2000).optional(),
});

export const cancelAppointmentSchema = z.object({
  appointmentId: idSchema,
  cancellationReason: z.string().trim().max(500).optional(),
});

export const appointmentIdSchema = z.object({ appointmentId: idSchema });

/**
 * A fixed set of legal transitions, so an appointment can't, say, jump from
 * PENDING straight to COMPLETED without ever being CONFIRMED. Enforcement of
 * this map belongs in the doctor/admin service layer built in a later phase
 * — patients may only ever reach CANCELLED, via `cancelAppointmentSchema`.
 */
export const updateAppointmentStatusSchema = z.object({
  appointmentId: idSchema,
  status: appointmentStatusSchema,
  cancellationReason: z.string().max(500).optional(),
});

export type SlotQueryInput = z.infer<typeof slotQuerySchema>;
export type BookAppointmentInput = z.infer<typeof bookAppointmentSchema>;
export type CancelAppointmentInput = z.infer<typeof cancelAppointmentSchema>;
export type UpdateAppointmentStatusInput = z.infer<typeof updateAppointmentStatusSchema>;
