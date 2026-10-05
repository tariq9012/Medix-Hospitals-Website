import { z } from "zod";

import { idSchema, paginationSchema } from "./common";
import { appointmentStatusSchema } from "./enums";

/**
 * Note: no `hospitalId` appears in any of these input schemas. The
 * authorized hospital is always resolved from the session via
 * `requireHospitalAdmin()` on the server — accepting it as input, even
 * validated, would invite exactly the spoofing this phase must prevent.
 */

export const updateHospitalProfileSchema = z.object({
  name: z.string().trim().min(2, "Hospital name is required.").max(200),
  description: z.string().trim().max(2000).optional(),
  phone: z.string().trim().max(30).optional(),
  email: z
    .string()
    .trim()
    .email("Enter a valid email address.")
    .max(255)
    .optional()
    .or(z.literal("")),
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  logo: z.string().trim().url().max(2048).optional().or(z.literal("")),
  coverImage: z.string().trim().url().max(2048).optional().or(z.literal("")),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});

export const affiliateDoctorSchema = z.object({
  doctorId: idSchema,
  department: z.string().trim().max(120).optional(),
});

export const removeDoctorAffiliationSchema = z.object({ doctorId: idSchema });

const departmentFieldsSchema = z.object({
  name: z.string().trim().min(2, "Department name is required.").max(150),
  description: z.string().trim().max(1000).optional(),
  phoneExtension: z.string().trim().max(30).optional(),
  location: z.string().trim().max(150).optional(),
});

export const createDepartmentSchema = departmentFieldsSchema;
export const updateDepartmentSchema = z.object({
  departmentId: idSchema,
  patch: departmentFieldsSchema.partial(),
});
export const toggleDepartmentSchema = z.object({
  departmentId: idSchema,
  isActive: z.boolean(),
});

const serviceFieldsSchema = z.object({
  name: z.string().trim().min(2, "Service name is required.").max(150),
  description: z.string().trim().max(1000).optional(),
  category: z.string().trim().max(100).optional(),
});

export const createServiceSchema = serviceFieldsSchema;
export const updateServiceSchema = z.object({
  serviceId: idSchema,
  patch: serviceFieldsSchema.partial(),
});
export const toggleServiceSchema = z.object({ serviceId: idSchema, isActive: z.boolean() });

export const hospitalDoctorFiltersSchema = paginationSchema.extend({
  search: z.string().trim().max(200).optional(),
});

export const hospitalAppointmentFiltersSchema = paginationSchema.extend({
  status: appointmentStatusSchema.optional(),
  scope: z.enum(["ALL", "TODAY", "UPCOMING"]).optional(),
  search: z.string().trim().max(200).optional(),
});

export const hospitalPatientFiltersSchema = paginationSchema.extend({
  search: z.string().trim().max(200).optional(),
});

export type UpdateHospitalProfileInput = z.infer<typeof updateHospitalProfileSchema>;
export type AffiliateDoctorInput = z.infer<typeof affiliateDoctorSchema>;
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
export type HospitalDoctorFilters = z.infer<typeof hospitalDoctorFiltersSchema>;
export type HospitalAppointmentFilters = z.infer<typeof hospitalAppointmentFiltersSchema>;
export type HospitalPatientFilters = z.infer<typeof hospitalPatientFiltersSchema>;
