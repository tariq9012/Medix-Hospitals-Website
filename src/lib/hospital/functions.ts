import { createServerFn } from "@tanstack/react-start";
import { isRedirect } from "@tanstack/react-router";
import { z } from "zod";

import { idSchema } from "@/lib/validation/common";
import {
  affiliateDoctorSchema,
  createDepartmentSchema,
  createServiceSchema,
  hospitalAppointmentFiltersSchema,
  hospitalDoctorFiltersSchema,
  hospitalPatientFiltersSchema,
  removeDoctorAffiliationSchema,
  toggleDepartmentSchema,
  toggleServiceSchema,
  updateDepartmentSchema,
  updateHospitalProfileSchema,
  updateServiceSchema,
} from "@/lib/validation/hospital";

import {
  createDepartment,
  createService,
  listDepartments,
  listServices,
  toggleDepartment,
  toggleService,
  updateDepartment,
  updateService,
} from "./catalog.server";
import { affiliateDoctor, removeDoctorAffiliation, updateHospitalProfile } from "./doctors.server";
import {
  HospitalError,
  getHospitalAppointment,
  getHospitalDashboardStats,
  listAffiliatableDoctors,
  listHospitalAppointments,
  listHospitalDoctors,
  listHospitalPatients,
  listHospitalSchedules,
  listHospitalSpecialties,
  requireOperationalHospital,
  resolveHospitalContext,
} from "./queries.server";

/**
 * Every handler resolves the authorized hospital from the session itself.
 * No handler accepts a `hospitalId` argument for ownership — read handlers
 * use `resolveHospitalContext()` and mutations use
 * `requireOperationalHospital()`, which additionally requires the hospital's
 * own verification to be APPROVED.
 */

interface ActionError {
  message: string;
}
type ActionResult<T extends object> = ({ ok: true } & T) | ({ ok: false } & ActionError);
type SimpleActionResult = { ok: true } | ({ ok: false } & ActionError);

function toActionError(error: unknown): ActionError {
  // Authorization failures are signalled by a thrown redirect and must
  // reach the router rather than becoming a generic message.
  if (isRedirect(error)) throw error;
  if (error instanceof HospitalError) return { message: error.message };
  console.error("[hospital] unexpected error:", error);
  return { message: "Something went wrong. Please try again." };
}

// --- Context & dashboard ------------------------------------------------------------

export const getHospitalContextFn = createServerFn({ method: "GET" }).handler(async () => {
  const ctx = await resolveHospitalContext();
  return {
    hospital: ctx.hospital,
    authorizedHospitalIds: ctx.authorizedHospitalIds,
    isOperational: ctx.hospital.verificationStatus === "APPROVED",
  };
});

export const getHospitalDashboardFn = createServerFn({ method: "GET" }).handler(async () => {
  const ctx = await resolveHospitalContext();
  const isOperational = ctx.hospital.verificationStatus === "APPROVED";
  return {
    hospital: {
      id: ctx.hospital.id,
      name: ctx.hospital.name,
      verificationStatus: ctx.hospital.verificationStatus,
      verificationReason: ctx.hospital.verificationReason,
    },
    isOperational,
    stats: isOperational ? await getHospitalDashboardStats(ctx.hospital.id) : null,
  };
});

// --- Profile -------------------------------------------------------------------------

export const getHospitalProfileFn = createServerFn({ method: "GET" }).handler(async () => {
  const ctx = await resolveHospitalContext();
  return ctx.hospital;
});

export const updateHospitalProfileFn = createServerFn({ method: "POST" })
  .validator(updateHospitalProfileSchema)
  .handler(async ({ data }): Promise<SimpleActionResult> => {
    try {
      const ctx = await requireOperationalHospital();
      await updateHospitalProfile(ctx.hospital.id, ctx.user.id, data);
      return { ok: true };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

// --- Doctors --------------------------------------------------------------------------

export const listHospitalDoctorsFn = createServerFn({ method: "GET" })
  .validator(hospitalDoctorFiltersSchema)
  .handler(async ({ data }) => {
    const ctx = await resolveHospitalContext();
    return listHospitalDoctors(ctx.hospital.id, data);
  });

export const listAffiliatableDoctorsFn = createServerFn({ method: "GET" })
  .validator(z.object({ search: z.string().trim().max(200).optional() }))
  .handler(async ({ data }) => {
    const ctx = await resolveHospitalContext();
    return listAffiliatableDoctors(ctx.hospital.id, data.search);
  });

export const affiliateDoctorFn = createServerFn({ method: "POST" })
  .validator(affiliateDoctorSchema)
  .handler(async ({ data }): Promise<SimpleActionResult> => {
    try {
      const ctx = await requireOperationalHospital();
      await affiliateDoctor(ctx.hospital.id, ctx.user.id, data);
      return { ok: true };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

export const removeDoctorAffiliationFn = createServerFn({ method: "POST" })
  .validator(removeDoctorAffiliationSchema)
  .handler(async ({ data }): Promise<SimpleActionResult> => {
    try {
      const ctx = await requireOperationalHospital();
      await removeDoctorAffiliation(ctx.hospital.id, ctx.user.id, data.doctorId);
      return { ok: true };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

// --- Appointments & patients ------------------------------------------------------------

export const listHospitalAppointmentsFn = createServerFn({ method: "GET" })
  .validator(hospitalAppointmentFiltersSchema)
  .handler(async ({ data }) => {
    const ctx = await resolveHospitalContext();
    return listHospitalAppointments(ctx.hospital.id, data);
  });

export const getHospitalAppointmentFn = createServerFn({ method: "GET" })
  .validator(z.object({ appointmentId: idSchema }))
  .handler(async ({ data }) => {
    const ctx = await resolveHospitalContext();
    return getHospitalAppointment(ctx.hospital.id, data.appointmentId);
  });

export const listHospitalPatientsFn = createServerFn({ method: "GET" })
  .validator(hospitalPatientFiltersSchema)
  .handler(async ({ data }) => {
    const ctx = await resolveHospitalContext();
    return listHospitalPatients(ctx.hospital.id, data);
  });

// --- Departments ---------------------------------------------------------------------------

export const listDepartmentsFn = createServerFn({ method: "GET" }).handler(async () => {
  const ctx = await resolveHospitalContext();
  return listDepartments(ctx.hospital.id);
});

export const createDepartmentFn = createServerFn({ method: "POST" })
  .validator(createDepartmentSchema)
  .handler(async ({ data }): Promise<ActionResult<{ departmentId: string }>> => {
    try {
      const ctx = await requireOperationalHospital();
      const created = await createDepartment(ctx.hospital.id, ctx.user.id, data);
      return { ok: true, departmentId: created.id };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

export const updateDepartmentFn = createServerFn({ method: "POST" })
  .validator(updateDepartmentSchema)
  .handler(async ({ data }): Promise<SimpleActionResult> => {
    try {
      const ctx = await requireOperationalHospital();
      await updateDepartment(ctx.hospital.id, ctx.user.id, data);
      return { ok: true };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

export const toggleDepartmentFn = createServerFn({ method: "POST" })
  .validator(toggleDepartmentSchema)
  .handler(async ({ data }): Promise<SimpleActionResult> => {
    try {
      const ctx = await requireOperationalHospital();
      await toggleDepartment(ctx.hospital.id, ctx.user.id, data.departmentId, data.isActive);
      return { ok: true };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

// --- Services -----------------------------------------------------------------------------------

export const listServicesFn = createServerFn({ method: "GET" }).handler(async () => {
  const ctx = await resolveHospitalContext();
  return listServices(ctx.hospital.id);
});

export const createServiceFn = createServerFn({ method: "POST" })
  .validator(createServiceSchema)
  .handler(async ({ data }): Promise<ActionResult<{ serviceId: string }>> => {
    try {
      const ctx = await requireOperationalHospital();
      const created = await createService(ctx.hospital.id, ctx.user.id, data);
      return { ok: true, serviceId: created.id };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

export const updateServiceFn = createServerFn({ method: "POST" })
  .validator(updateServiceSchema)
  .handler(async ({ data }): Promise<SimpleActionResult> => {
    try {
      const ctx = await requireOperationalHospital();
      await updateService(ctx.hospital.id, ctx.user.id, data);
      return { ok: true };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

export const toggleServiceFn = createServerFn({ method: "POST" })
  .validator(toggleServiceSchema)
  .handler(async ({ data }): Promise<SimpleActionResult> => {
    try {
      const ctx = await requireOperationalHospital();
      await toggleService(ctx.hospital.id, ctx.user.id, data.serviceId, data.isActive);
      return { ok: true };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

// --- Schedules & specialties -----------------------------------------------------------------------

export const listHospitalSchedulesFn = createServerFn({ method: "GET" }).handler(async () => {
  const ctx = await resolveHospitalContext();
  return listHospitalSchedules(ctx.hospital.id);
});

export const listHospitalSpecialtiesFn = createServerFn({ method: "GET" }).handler(async () => {
  const ctx = await resolveHospitalContext();
  return listHospitalSpecialties(ctx.hospital.id);
});
