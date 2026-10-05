import type { UserRole } from "@/lib/validation/enums";
import type { Role as UiRole } from "@/types";

/**
 * The database enum (`PATIENT` | `DOCTOR` | `HOSPITAL_ADMIN` | `ADMIN`) and
 * the existing UI `Role` type (`"patient" | "doctor" | "hospital" | "admin"`,
 * used by `DashboardLayout`/`nav-config`) predate each other and don't share
 * casing or naming — this is the single place that bridges them, so the
 * mapping is never duplicated or drifted.
 */
const DB_ROLE_TO_UI_ROLE: Record<UserRole, UiRole> = {
  PATIENT: "patient",
  DOCTOR: "doctor",
  HOSPITAL_ADMIN: "hospital",
  ADMIN: "admin",
};

const DB_ROLE_TO_DASHBOARD_PATH: Record<UserRole, string> = {
  PATIENT: "/patient/dashboard",
  DOCTOR: "/doctor/dashboard",
  HOSPITAL_ADMIN: "/hospital/dashboard",
  ADMIN: "/admin/dashboard",
};

export function dbRoleToUiRole(role: UserRole): UiRole {
  return DB_ROLE_TO_UI_ROLE[role];
}

export function dashboardPathForRole(role: UserRole): string {
  return DB_ROLE_TO_DASHBOARD_PATH[role];
}
