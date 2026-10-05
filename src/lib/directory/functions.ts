import { createServerFn } from "@tanstack/react-start";

import { getOptionalUser } from "@/lib/auth/authorization.server";
import { listPublicReviews } from "@/lib/reviews/queries.server";
import {
  doctorSearchSchema,
  hospitalSearchSchema,
  profileKeySchema,
  reviewsPageSchema,
  slugSchema,
} from "@/lib/validation/directory";

import {
  getDoctorFilterOptions,
  getPublicDoctorByKey,
  searchPublicDoctors,
} from "./doctors.server";
import { getHomepageData, getPublicStats } from "./home.server";
import {
  getHospitalFilterOptions,
  getPublicHospitalByKey,
  searchPublicHospitals,
} from "./hospitals.server";
import { getPublicSpecialtyBySlug, listPublicSpecialties } from "./specialties.server";
import type { DirectoryViewer } from "./types";

/**
 * Public-directory server-function boundary. Handlers never return raw DB
 * rows (only the DTOs in ./types) and never surface raw database errors: any
 * unexpected failure is logged server-side and replaced with a generic,
 * safe message.
 */

const SAFE_ERROR = "We couldn't load this right now. Please try again.";

async function currentViewer(): Promise<DirectoryViewer | null> {
  const user = await getOptionalUser();
  return user ? { userId: user.id, role: user.role } : null;
}

async function safely<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error(`[directory] ${label} failed:`, error);
    throw new Error(SAFE_ERROR);
  }
}

export const searchDoctorsFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => doctorSearchSchema.parse(input ?? {}))
  .handler(async ({ data }) =>
    safely("searchDoctors", async () => {
      const viewer = await currentViewer();
      const [results, options] = await Promise.all([
        searchPublicDoctors(data, viewer),
        getDoctorFilterOptions(),
      ]);
      return { results, options, viewerRole: viewer?.role ?? null };
    }),
  );

export const getDoctorProfileFn = createServerFn({ method: "GET" })
  .validator(profileKeySchema)
  .handler(async ({ data }) =>
    safely("getDoctorProfile", async () => {
      const viewer = await currentViewer();
      // null => not found OR not publicly visible (suspended/pending/rejected) — indistinguishable by design.
      const doctor = await getPublicDoctorByKey(data.key, viewer);
      return { doctor, viewerRole: viewer?.role ?? null };
    }),
  );

export const searchHospitalsFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => hospitalSearchSchema.parse(input ?? {}))
  .handler(async ({ data }) =>
    safely("searchHospitals", async () => {
      const viewer = await currentViewer();
      const [results, options] = await Promise.all([
        searchPublicHospitals(data, viewer),
        getHospitalFilterOptions(),
      ]);
      return { results, options, viewerRole: viewer?.role ?? null };
    }),
  );

export const getHospitalProfileFn = createServerFn({ method: "GET" })
  .validator(profileKeySchema)
  .handler(async ({ data }) =>
    safely("getHospitalProfile", async () => {
      const viewer = await currentViewer();
      const hospital = await getPublicHospitalByKey(data.key, viewer);
      return { hospital, viewerRole: viewer?.role ?? null };
    }),
  );

export const listSpecialtiesFn = createServerFn({ method: "GET" }).handler(async () =>
  safely("listSpecialties", () => listPublicSpecialties({ onlyWithProviders: true })),
);

export const getSpecialtyPageFn = createServerFn({ method: "GET" })
  .validator(slugSchema)
  .handler(async ({ data }) =>
    safely("getSpecialtyPage", async () => {
      const specialty = await getPublicSpecialtyBySlug(data.slug);
      if (!specialty) return null;
      const viewer = await currentViewer();
      const [doctors, hospitals] = await Promise.all([
        searchPublicDoctors(
          doctorSearchSchema.parse({ specialty: data.slug, sort: "recommended", pageSize: 12 }),
          viewer,
        ),
        searchPublicHospitals(
          hospitalSearchSchema.parse({ specialty: data.slug, sort: "recommended", pageSize: 6 }),
          viewer,
        ),
      ]);
      return {
        specialty,
        doctors: doctors.items,
        doctorTotal: doctors.total,
        hospitals: hospitals.items,
        hospitalTotal: hospitals.total,
        viewerRole: viewer?.role ?? null,
      };
    }),
  );

export const getHomepageFn = createServerFn({ method: "GET" }).handler(async () =>
  safely("getHomepage", async () => {
    const viewer = await currentViewer();
    const data = await getHomepageData(viewer);
    return { ...data, viewerRole: viewer?.role ?? null };
  }),
);

export const listPublicReviewsFn = createServerFn({ method: "GET" })
  .validator(reviewsPageSchema)
  .handler(async ({ data }) =>
    safely("listPublicReviews", () =>
      listPublicReviews({ target: data.target, targetId: data.targetId, page: data.page }),
    ),
  );

export const getPublicStatsFn = createServerFn({ method: "GET" }).handler(async () =>
  safely("getPublicStats", () => getPublicStats()),
);
