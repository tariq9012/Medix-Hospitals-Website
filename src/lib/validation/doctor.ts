import { z } from "zod";

import { idSchema } from "./common";
import { consultationTypeSchema, dayOfWeekSchema } from "./enums";

const timeSchema = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Expected HH:MM.");

/** The only transitions a doctor may request directly — see src/lib/doctor/appointments.server.ts for the enforced matrix. */
export const doctorAppointmentActionSchema = z.enum(["CONFIRM", "COMPLETE", "NO_SHOW", "CANCEL"]);

export const doctorAppointmentStatusUpdateSchema = z.object({
  appointmentId: idSchema,
  action: doctorAppointmentActionSchema,
  cancellationReason: z.string().trim().max(500).optional(),
});

const availabilityRuleObjectSchema = z.object({
  hospitalId: idSchema.optional(),
  dayOfWeek: dayOfWeekSchema,
  startTime: timeSchema,
  endTime: timeSchema,
  slotDurationMinutes: z.coerce.number().int().min(5).max(240),
  consultationType: consultationTypeSchema,
  breakStartTime: timeSchema.optional(),
  breakEndTime: timeSchema.optional(),
});

function refineAvailabilityRule<T extends z.ZodType<z.infer<typeof availabilityRuleObjectSchema>>>(
  schema: T,
) {
  return schema
    .refine((data) => data.startTime < data.endTime, {
      message: "Start time must be before end time.",
      path: ["endTime"],
    })
    .refine(
      (data) =>
        (!data.breakStartTime && !data.breakEndTime) ||
        (data.breakStartTime && data.breakEndTime && data.breakStartTime < data.breakEndTime),
      { message: "Break start must be before break end.", path: ["breakEndTime"] },
    )
    .refine(
      (data) =>
        !data.breakStartTime ||
        !data.breakEndTime ||
        (data.breakStartTime >= data.startTime && data.breakEndTime <= data.endTime),
      { message: "Break must fall within the working hours.", path: ["breakStartTime"] },
    );
}

export const availabilityRuleSchema = refineAvailabilityRule(availabilityRuleObjectSchema);

export const createAvailabilityRuleSchema = availabilityRuleSchema;

export const updateAvailabilityRuleSchema = z.object({
  ruleId: idSchema,
  patch: availabilityRuleObjectSchema.partial(),
});

export const toggleAvailabilityRuleSchema = z.object({
  ruleId: idSchema,
  isActive: z.boolean(),
});

export const deleteAvailabilityRuleSchema = z.object({ ruleId: idSchema });

const feeSchema = z.coerce.number().min(0).max(1_000_000);

/** Editable doctor profile fields. License number, verification status, and rating are deliberately excluded. */
export const updateDoctorProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  biography: z.string().trim().max(2000).optional(),
  yearsOfExperience: z.coerce.number().int().min(0).max(80).optional(),
  profileImage: z.string().trim().url().max(2048).optional().or(z.literal("")),
  consultationFee: feeSchema,
});

export type DoctorAppointmentAction = z.infer<typeof doctorAppointmentActionSchema>;
export type DoctorAppointmentStatusUpdateInput = z.infer<
  typeof doctorAppointmentStatusUpdateSchema
>;
export type CreateAvailabilityRuleInput = z.infer<typeof createAvailabilityRuleSchema>;
export type UpdateAvailabilityRuleInput = z.infer<typeof updateAvailabilityRuleSchema>;
export type UpdateDoctorProfileInput = z.infer<typeof updateDoctorProfileSchema>;
