import { createServerFn } from "@tanstack/react-start";
import { isRedirect } from "@tanstack/react-router";

import { requireRole } from "@/lib/auth/authorization.server";
import { setDoctorFavoriteSchema, setHospitalFavoriteSchema } from "@/lib/validation/directory";

import { FavoriteError } from "./errors";
import {
  listFavoriteDoctors,
  listFavoriteHospitals,
  setDoctorFavorite,
  setHospitalFavorite,
} from "./service.server";

type FavResult = { ok: true; favorite: boolean } | { ok: false; message: string };

function toFail(error: unknown): { ok: false; message: string } {
  if (isRedirect(error)) throw error;
  if (error instanceof FavoriteError) return { ok: false, message: error.message };
  console.error("[favorites] unexpected error:", error);
  return { ok: false, message: "Something went wrong. Please try again." };
}

/**
 * Identity is ALWAYS the session's patient — these schemas have no patientId
 * field, so a browser cannot target another patient's favorites. The caller
 * states the DESIRED state (favorite: true/false), which makes retries and
 * double-clicks idempotent.
 */
export const setDoctorFavoriteFn = createServerFn({ method: "POST" })
  .validator(setDoctorFavoriteSchema)
  .handler(async ({ data }): Promise<FavResult> => {
    try {
      const user = await requireRole("PATIENT");
      const { favorite } = await setDoctorFavorite(user.id, data.doctorId, data.favorite);
      return { ok: true, favorite };
    } catch (error) {
      return toFail(error);
    }
  });

export const setHospitalFavoriteFn = createServerFn({ method: "POST" })
  .validator(setHospitalFavoriteSchema)
  .handler(async ({ data }): Promise<FavResult> => {
    try {
      const user = await requireRole("PATIENT");
      const { favorite } = await setHospitalFavorite(user.id, data.hospitalId, data.favorite);
      return { ok: true, favorite };
    } catch (error) {
      return toFail(error);
    }
  });

export const listMyFavoritesFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireRole("PATIENT");
  const [doctors, hospitals] = await Promise.all([
    listFavoriteDoctors(user.id),
    listFavoriteHospitals(user.id),
  ]);
  return { doctors, hospitals };
});
