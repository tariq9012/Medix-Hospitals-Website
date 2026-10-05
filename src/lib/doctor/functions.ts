import { getDoctorRatingStats } from "@/lib/reviews/aggregate.server";
import { createServerFn } from "@tanstack/react-start";
import { isRedirect } from "@tanstack/react-router";
import { z } from "zod";

import { AppointmentError } from "@/lib/appointments/errors";
import { idSchema } from "@/lib/validation/common";
import {
  createAvailabilityRuleSchema,
  deleteAvailabilityRuleSchema,
  doctorAppointmentStatusUpdateSchema,
  toggleAvailabilityRuleSchema,
  updateAvailabilityRuleSchema,
  updateDoctorProfileSchema,
} from "@/lib/validation/doctor";

import { applyDoctorAppointmentAction } from "./appointments.server";
import {
  createAvailabilityRule,
  deleteAvailabilityRule,
  listDoctorAvailability,
  toggleAvailabilityRule,
  updateAvailabilityRule,
} from "./availability.server";
import { updateDoctorProfile } from "./profile.server";
import {
  getDoctorDashboardStats,
  getDoctorHospitals,
  getDoctorPatientDetail,
  getOwnedDoctorAppointment,
  listDoctorAppointments,
  listDoctorPatients,
  requireDoctorRecord,
  requireVerifiedDoctorRecord,
} from "./queries.server";

/**
 * Same client-safe boundary pattern used by the auth and patient-appointment
 * modules: `createServerFn` compiles each `.handler()` into a server-only
 * chunk. Every handler resolves the doctor's identity itself via
 * `requireDoctorRecord()`/`requireVerifiedDoctorRecord()` — no `doctorId` is
 * ever accepted as client input for ownership purposes.
 */

interface ActionError {
  message: string;
}
type ActionResult<T extends object> = ({ ok: true } & T) | ({ ok: false } & ActionError);
type SimpleActionResult = { ok: true } | ({ ok: false } & ActionError);

function toActionError(error: unknown): ActionError {
  // `requireX()` helpers signal "not allowed" by throwing a redirect. Those
  // must propagate so the router can actually send the user to /login or
  // /unauthorized — swallowing them here would turn a real authorization
  // outcome into a meaningless "something went wrong".
  if (isRedirect(error)) throw error;
  if (error instanceof AppointmentError) return { message: error.message };
  console.error("[doctor] unexpected error:", error);
  return { message: "Something went wrong. Please try again." };
}

// --- Dashboard & appointments ------------------------------------------------

export const getDoctorDashboardFn = createServerFn({ method: "GET" }).handler(async () => {
  const doctor = await requireDoctorRecord();
  return {
    doctor: {
      id: doctor.id,
      firstName: doctor.firstName,
      lastName: doctor.lastName,
      verificationStatus: doctor.verificationStatus,
    },
    stats: await getDoctorDashboardStats(doctor.id),
  };
});

export const listDoctorAppointmentsFn = createServerFn({ method: "GET" }).handler(async () => {
  const doctor = await requireDoctorRecord();
  try {
    return await listDoctorAppointments(doctor.id);
  } catch (error) {
    console.error("[doctor] listDoctorAppointmentsFn failed:", error);
    return [];
  }
});

export const getDoctorAppointmentFn = createServerFn({ method: "GET" })
  .validator(z.object({ appointmentId: idSchema }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctorRecord();
    try {
      return await getOwnedDoctorAppointment(doctor.id, data.appointmentId);
    } catch (error) {
      console.error("[doctor] getDoctorAppointmentFn failed:", error);
      return null;
    }
  });

export const updateDoctorAppointmentStatusFn = createServerFn({ method: "POST" })
  .validator(doctorAppointmentStatusUpdateSchema)
  .handler(async ({ data }): Promise<ActionResult<{ status: string }>> => {
    try {
      const doctor = await requireVerifiedDoctorRecord();
      const updated = await applyDoctorAppointmentAction(doctor.id, doctor.userId, data);
      return { ok: true, status: updated.status };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

// --- Patients -----------------------------------------------------------------

export const listDoctorPatientsFn = createServerFn({ method: "GET" }).handler(async () => {
  const doctor = await requireDoctorRecord();
  try {
    return await listDoctorPatients(doctor.id);
  } catch (error) {
    console.error("[doctor] listDoctorPatientsFn failed:", error);
    return [];
  }
});

export const getDoctorPatientFn = createServerFn({ method: "GET" })
  .validator(z.object({ patientId: idSchema }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctorRecord();
    try {
      return await getDoctorPatientDetail(doctor.id, data.patientId);
    } catch (error) {
      console.error("[doctor] getDoctorPatientFn failed:", error);
      return null;
    }
  });

// --- Availability ---------------------------------------------------------------

export const listMyAvailabilityFn = createServerFn({ method: "GET" }).handler(async () => {
  const doctor = await requireDoctorRecord();
  try {
    return await listDoctorAvailability(doctor.id);
  } catch (error) {
    console.error("[doctor] listMyAvailabilityFn failed:", error);
    return [];
  }
});

export const listMyHospitalsFn = createServerFn({ method: "GET" }).handler(async () => {
  const doctor = await requireDoctorRecord();
  try {
    return await getDoctorHospitals(doctor.id);
  } catch (error) {
    console.error("[doctor] listMyHospitalsFn failed:", error);
    return [];
  }
});

export const createAvailabilityRuleFn = createServerFn({ method: "POST" })
  .validator(createAvailabilityRuleSchema)
  .handler(async ({ data }): Promise<ActionResult<{ ruleId: string }>> => {
    try {
      const doctor = await requireVerifiedDoctorRecord();
      const rule = await createAvailabilityRule(doctor.id, doctor.userId, data);
      return { ok: true, ruleId: rule.id };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

export const updateAvailabilityRuleFn = createServerFn({ method: "POST" })
  .validator(updateAvailabilityRuleSchema)
  .handler(async ({ data }): Promise<SimpleActionResult> => {
    try {
      const doctor = await requireVerifiedDoctorRecord();
      await updateAvailabilityRule(doctor.id, doctor.userId, data);
      return { ok: true };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

export const toggleAvailabilityRuleFn = createServerFn({ method: "POST" })
  .validator(toggleAvailabilityRuleSchema)
  .handler(async ({ data }): Promise<SimpleActionResult> => {
    try {
      const doctor = await requireVerifiedDoctorRecord();
      await toggleAvailabilityRule(doctor.id, doctor.userId, data.ruleId, data.isActive);
      return { ok: true };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

export const deleteAvailabilityRuleFn = createServerFn({ method: "POST" })
  .validator(deleteAvailabilityRuleSchema)
  .handler(async ({ data }): Promise<SimpleActionResult> => {
    try {
      const doctor = await requireVerifiedDoctorRecord();
      await deleteAvailabilityRule(doctor.id, doctor.userId, data.ruleId);
      return { ok: true };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

// --- Profile --------------------------------------------------------------------

export const getMyDoctorProfileFn = createServerFn({ method: "GET" }).handler(async () => {
  const doctor = await requireDoctorRecord();
  // Phase 13: the stored rating columns are deprecated; overlay the value derived from PUBLISHED reviews.
  const stats = await getDoctorRatingStats(doctor.id);
  return {
    ...doctor,
    rating: stats.rating === null ? "0" : stats.rating.toFixed(2),
    totalReviews: stats.reviewCount,
  };
});

export const updateDoctorProfileFn = createServerFn({ method: "POST" })
  .validator(updateDoctorProfileSchema)
  .handler(async ({ data }): Promise<SimpleActionResult> => {
    try {
      const doctor = await requireDoctorRecord();
      await updateDoctorProfile(doctor.id, doctor.userId, data);
      return { ok: true };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });
