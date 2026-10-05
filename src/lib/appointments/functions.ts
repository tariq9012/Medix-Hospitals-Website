import { createServerFn } from "@tanstack/react-start";
import { isRedirect } from "@tanstack/react-router";

import { requireRole } from "@/lib/auth/authorization.server";
import { idSchema } from "@/lib/validation/common";
import {
  appointmentIdSchema,
  bookAppointmentSchema,
  cancelAppointmentSchema,
  slotQuerySchema,
} from "@/lib/validation/appointments";
import { z } from "zod";

import { generateSlotsForDate } from "./availability.server";
import { AppointmentError } from "./errors";
import {
  getBookableDoctorById,
  getDashboardAppointmentSummary,
  getOwnedPatientAppointment,
  listBookableDoctors,
  listPatientAppointments,
} from "./queries.server";
import { bookAppointment, cancelAppointment } from "./service.server";

/**
 * Same client-safe boundary pattern as `src/lib/auth/functions.ts`:
 * `createServerFn` compiles each `.handler()` (and everything it calls into,
 * including the `*.server.ts` modules here) into a server-only chunk. The
 * database and business logic never reach the browser.
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
  console.error("[appointments] unexpected error:", error);
  return { message: "Something went wrong. Please try again." };
}

export const listBookableDoctorsFn = createServerFn({ method: "GET" }).handler(async () => {
  try {
    return await listBookableDoctors();
  } catch (error) {
    console.error("[appointments] listBookableDoctorsFn failed:", error);
    return [];
  }
});

export const getBookableDoctorFn = createServerFn({ method: "GET" })
  .validator(z.object({ doctorId: idSchema }))
  .handler(async ({ data }) => {
    try {
      return await getBookableDoctorById(data.doctorId);
    } catch (error) {
      console.error("[appointments] getBookableDoctorFn failed:", error);
      return null;
    }
  });

export const getAvailableSlotsFn = createServerFn({ method: "GET" })
  .validator(slotQuerySchema)
  .handler(async ({ data }) => {
    try {
      return await generateSlotsForDate({
        doctorId: data.doctorId,
        date: data.date,
        hospitalId: data.hospitalId,
        consultationType: data.consultationType,
      });
    } catch (error) {
      console.error("[appointments] getAvailableSlotsFn failed:", error);
      return [];
    }
  });

export const bookAppointmentFn = createServerFn({ method: "POST" })
  .validator(bookAppointmentSchema)
  .handler(async ({ data }): Promise<ActionResult<{ appointmentId: string }>> => {
    try {
      const user = await requireRole("PATIENT");
      const appointment = await bookAppointment(user.id, data);
      return { ok: true, appointmentId: appointment.id };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

export const listMyAppointmentsFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireRole("PATIENT");
  try {
    return await listPatientAppointments(user.id);
  } catch (error) {
    console.error("[appointments] listMyAppointmentsFn failed:", error);
    return [];
  }
});

export const getMyAppointmentFn = createServerFn({ method: "GET" })
  .validator(appointmentIdSchema)
  .handler(async ({ data }) => {
    const user = await requireRole("PATIENT");
    try {
      return await getOwnedPatientAppointment(user.id, data.appointmentId);
    } catch (error) {
      console.error("[appointments] getMyAppointmentFn failed:", error);
      return null;
    }
  });

export const cancelAppointmentFn = createServerFn({ method: "POST" })
  .validator(cancelAppointmentSchema)
  .handler(async ({ data }): Promise<SimpleActionResult> => {
    try {
      const user = await requireRole("PATIENT");
      await cancelAppointment(user.id, data);
      return { ok: true };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

export const getDashboardAppointmentSummaryFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await requireRole("PATIENT");
    return getDashboardAppointmentSummary(user.id);
  },
);
