import {
  doctorSearchSchema,
  hospitalSearchSchema,
  type DoctorSort,
  type HospitalSort,
} from "@/lib/validation/directory";

/**
 * URL <-> server-filter bridge (client-safe: zod only). Route `validateSearch`
 * runs the same lenient schemas the server uses, then drops defaults so URLs
 * stay clean (`/doctors?specialty=cardiology&page=2&sort=rating`). Invalid
 * values fall back to "no filter" rather than erroring.
 */

export interface DoctorUrlSearch {
  q?: string;
  specialty?: string;
  hospital?: string;
  city?: string;
  minFee?: number;
  maxFee?: number;
  minRating?: number;
  minExperience?: number;
  mode?: "ONLINE" | "IN_PERSON";
  scheduled?: "1";
  sort?: DoctorSort;
  page?: number;
}

export interface HospitalUrlSearch {
  q?: string;
  specialty?: string;
  city?: string;
  department?: string;
  service?: string;
  sort?: HospitalSort;
  page?: number;
}

function compact<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

export function parseDoctorSearch(raw: Record<string, unknown>): DoctorUrlSearch {
  const p = doctorSearchSchema.parse(raw);
  return compact({
    q: p.q,
    specialty: p.specialty,
    hospital: p.hospital,
    city: p.city,
    minFee: p.minFee,
    maxFee: p.maxFee,
    minRating: p.minRating,
    minExperience: p.minExperience,
    mode: p.mode,
    scheduled: p.scheduled,
    sort: p.sort === "recommended" ? undefined : p.sort,
    page: p.page === 1 ? undefined : p.page,
  });
}

export function parseHospitalSearch(raw: Record<string, unknown>): HospitalUrlSearch {
  const p = hospitalSearchSchema.parse(raw);
  return compact({
    q: p.q,
    specialty: p.specialty,
    city: p.city,
    department: p.department,
    service: p.service,
    sort: p.sort === "recommended" ? undefined : p.sort,
    page: p.page === 1 ? undefined : p.page,
  });
}
