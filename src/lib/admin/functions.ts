import { createServerFn } from "@tanstack/react-start";
import { isRedirect } from "@tanstack/react-router";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/authorization.server";
import {
  adminAppointmentFiltersSchema,
  adminAuditFiltersSchema,
  adminDoctorFiltersSchema,
  adminHospitalFiltersSchema,
  adminUserFiltersSchema,
  adminUserStatusActionSchema,
  providerVerificationDecisionSchema,
} from "@/lib/validation/admin";
import { idSchema } from "@/lib/validation/common";

import {
  getAdminDashboardStats,
  getAdminDoctorDetail,
  getAdminHospitalDetail,
  getAdminUserDetail,
  listAdminAppointments,
  listAdminAuditLogs,
  listAdminDoctors,
  listAdminHospitals,
  listAdminUsers,
  listAuditActionNames,
  listRecentRegistrations,
  listRecentVerificationEvents,
} from "./queries.server";
import { applyUserStatusAction } from "./users.server";
import { AdminError, applyProviderVerificationDecision } from "./verification.server";

/**
 * Every handler below begins with `requireAdmin()`, which resolves an
 * authenticated, ACTIVE, ADMIN-role user from the session. A non-admin
 * calling any of these is redirected to /unauthorized before a single query
 * runs — the role is never read from client input.
 */

interface ActionError {
  message: string;
}
type SimpleActionResult = { ok: true } | ({ ok: false } & ActionError);

function toActionError(error: unknown): ActionError {
  // `requireX()` helpers signal "not allowed" by throwing a redirect. Those
  // must propagate so the router can actually send the user to /login or
  // /unauthorized — swallowing them here would turn a real authorization
  // outcome into a meaningless "something went wrong".
  if (isRedirect(error)) throw error;
  if (error instanceof AdminError) return { message: error.message };
  console.error("[admin] unexpected error:", error);
  return { message: "Something went wrong. Please try again." };
}

// --- Dashboard ------------------------------------------------------------------

export const getAdminDashboardFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const [stats, recentRegistrations, recentVerifications] = await Promise.all([
    getAdminDashboardStats(),
    listRecentRegistrations(),
    listRecentVerificationEvents(),
  ]);
  return { stats, recentRegistrations, recentVerifications };
});

// --- Users -----------------------------------------------------------------------

export const listAdminUsersFn = createServerFn({ method: "GET" })
  .validator(adminUserFiltersSchema)
  .handler(async ({ data }) => {
    await requireAdmin();
    return listAdminUsers(data);
  });

export const getAdminUserFn = createServerFn({ method: "GET" })
  .validator(z.object({ userId: idSchema }))
  .handler(async ({ data }) => {
    await requireAdmin();
    return getAdminUserDetail(data.userId);
  });

export const updateUserStatusFn = createServerFn({ method: "POST" })
  .validator(adminUserStatusActionSchema)
  .handler(async ({ data }): Promise<SimpleActionResult> => {
    try {
      const admin = await requireAdmin();
      await applyUserStatusAction(admin.id, data);
      return { ok: true };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

// --- Doctors ----------------------------------------------------------------------

export const listAdminDoctorsFn = createServerFn({ method: "GET" })
  .validator(adminDoctorFiltersSchema)
  .handler(async ({ data }) => {
    await requireAdmin();
    return listAdminDoctors(data);
  });

export const getAdminDoctorFn = createServerFn({ method: "GET" })
  .validator(z.object({ doctorId: idSchema }))
  .handler(async ({ data }) => {
    await requireAdmin();
    return getAdminDoctorDetail(data.doctorId);
  });

// --- Hospitals ---------------------------------------------------------------------

export const listAdminHospitalsFn = createServerFn({ method: "GET" })
  .validator(adminHospitalFiltersSchema)
  .handler(async ({ data }) => {
    await requireAdmin();
    return listAdminHospitals(data);
  });

export const getAdminHospitalFn = createServerFn({ method: "GET" })
  .validator(z.object({ hospitalId: idSchema }))
  .handler(async ({ data }) => {
    await requireAdmin();
    return getAdminHospitalDetail(data.hospitalId);
  });

// --- Verification decisions ----------------------------------------------------------

export const decideProviderVerificationFn = createServerFn({ method: "POST" })
  .validator(providerVerificationDecisionSchema)
  .handler(async ({ data }): Promise<SimpleActionResult> => {
    try {
      const admin = await requireAdmin();
      await applyProviderVerificationDecision(admin.id, data);
      return { ok: true };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

// --- Appointments & audit ------------------------------------------------------------

export const listAdminAppointmentsFn = createServerFn({ method: "GET" })
  .validator(adminAppointmentFiltersSchema)
  .handler(async ({ data }) => {
    await requireAdmin();
    return listAdminAppointments(data);
  });

export const listAdminAuditLogsFn = createServerFn({ method: "GET" })
  .validator(adminAuditFiltersSchema)
  .handler(async ({ data }) => {
    await requireAdmin();
    const [logs, actions] = await Promise.all([listAdminAuditLogs(data), listAuditActionNames()]);
    return { ...logs, availableActions: actions };
  });
