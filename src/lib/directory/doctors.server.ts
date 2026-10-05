import "@tanstack/react-start/server-only";

import { and, asc, desc, eq, exists, gte, ilike, inArray, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  doctorAvailability,
  doctors,
  doctorSpecialties,
  favoriteDoctors,
  hospitalDoctors,
  hospitals,
  reviews,
  specialties,
  users,
} from "@/db/schema";
import { dayOfWeekFor, generateSlotsForDate } from "@/lib/appointments/availability.server";
import { doctorRatingAggregate, emptyBreakdown, toRating } from "@/lib/reviews/aggregate.server";
import type { DoctorSearchInput } from "@/lib/validation/directory";

import type {
  ConsultationMode,
  DirectoryViewer,
  DoctorFilterOptions,
  Paginated,
  PublicDoctorCard,
  PublicDoctorDetail,
  PublicHospitalRef,
  PublicSpecialtyRef,
  ScheduleWindow,
} from "./types";
import {
  escapeLike,
  isUuid,
  PUBLIC_DOCTOR_CONDITION,
  PUBLIC_HOSPITAL_CONDITION,
  searchTerms,
} from "./visibility.server";

const one = sql`1`;

function doctorName(first: string, last: string): string {
  return `Dr. ${first} ${last}`;
}

/** Builds every WHERE condition from already-validated input; all user values are bound parameters. */
function buildConditions(
  f: Pick<
    DoctorSearchInput,
    | "q"
    | "specialty"
    | "hospital"
    | "city"
    | "minFee"
    | "maxFee"
    | "minRating"
    | "minExperience"
    | "mode"
    | "scheduled"
  >,
  ratingAgg: ReturnType<typeof doctorRatingAggregate>,
): SQL[] {
  const c: SQL[] = [PUBLIC_DOCTOR_CONDITION];

  for (const term of searchTerms(f.q)) {
    const pat = `%${escapeLike(term)}%`;
    c.push(
      or(
        ilike(sql`concat_ws(' ', ${doctors.firstName}, ${doctors.lastName})`, pat),
        ilike(sql`coalesce(array_to_string(${doctors.qualifications}, ' '), '')`, pat),
        exists(
          db
            .select({ x: one })
            .from(doctorSpecialties)
            .innerJoin(specialties, eq(specialties.id, doctorSpecialties.specialtyId))
            .where(and(eq(doctorSpecialties.doctorId, doctors.id), ilike(specialties.name, pat))),
        ),
        exists(
          db
            .select({ x: one })
            .from(hospitalDoctors)
            .innerJoin(hospitals, eq(hospitals.id, hospitalDoctors.hospitalId))
            .where(
              and(
                eq(hospitalDoctors.doctorId, doctors.id),
                PUBLIC_HOSPITAL_CONDITION,
                or(ilike(hospitals.name, pat), ilike(hospitals.city, pat)),
              ),
            ),
        ),
      )!,
    );
  }

  if (f.specialty) {
    c.push(
      exists(
        db
          .select({ x: one })
          .from(doctorSpecialties)
          .innerJoin(specialties, eq(specialties.id, doctorSpecialties.specialtyId))
          .where(
            and(eq(doctorSpecialties.doctorId, doctors.id), eq(specialties.slug, f.specialty)),
          ),
      ),
    );
  }

  if (f.hospital) {
    c.push(
      exists(
        db
          .select({ x: one })
          .from(hospitalDoctors)
          .innerJoin(hospitals, eq(hospitals.id, hospitalDoctors.hospitalId))
          .where(
            and(
              eq(hospitalDoctors.doctorId, doctors.id),
              PUBLIC_HOSPITAL_CONDITION,
              eq(hospitals.slug, f.hospital),
            ),
          ),
      ),
    );
  }

  if (f.city) {
    c.push(
      exists(
        db
          .select({ x: one })
          .from(hospitalDoctors)
          .innerJoin(hospitals, eq(hospitals.id, hospitalDoctors.hospitalId))
          .where(
            and(
              eq(hospitalDoctors.doctorId, doctors.id),
              PUBLIC_HOSPITAL_CONDITION,
              sql`lower(${hospitals.city}) = lower(${f.city})`,
            ),
          ),
      ),
    );
  }

  if (f.minFee !== undefined) c.push(sql`${doctors.consultationFee} >= ${f.minFee}::numeric`);
  if (f.maxFee !== undefined) c.push(sql`${doctors.consultationFee} <= ${f.maxFee}::numeric`);
  if (f.minExperience !== undefined) c.push(gte(doctors.yearsOfExperience, f.minExperience));
  if (f.minRating !== undefined) {
    c.push(sql`coalesce(${ratingAgg.avgRating}, 0) >= ${f.minRating}::numeric`);
  }

  if (f.mode) {
    c.push(
      exists(
        db
          .select({ x: one })
          .from(doctorAvailability)
          .where(
            and(
              eq(doctorAvailability.doctorId, doctors.id),
              eq(doctorAvailability.isActive, true),
              eq(doctorAvailability.consultationType, f.mode),
            ),
          ),
      ),
    );
  }

  if (f.scheduled) {
    c.push(
      exists(
        db
          .select({ x: one })
          .from(doctorAvailability)
          .where(
            and(eq(doctorAvailability.doctorId, doctors.id), eq(doctorAvailability.isActive, true)),
          ),
      ),
    );
  }

  return c;
}

/** Whitelisted ORDER BY per sort key — the client only ever supplies the key, never SQL. */
function buildOrderBy(
  sort: DoctorSearchInput["sort"],
  ratingAgg: ReturnType<typeof doctorRatingAggregate>,
) {
  const rating = sql`coalesce(${ratingAgg.avgRating}, 0)`;
  const count = sql`coalesce(${ratingAgg.reviewCount}, 0)`;
  const tie = [asc(doctors.lastName), asc(doctors.firstName), asc(doctors.id)];
  switch (sort) {
    case "rating":
      return [desc(rating), desc(count), ...tie];
    case "reviews":
      return [desc(count), desc(rating), ...tie];
    case "fee_asc":
      return [sql`${doctors.consultationFee} asc nulls last`, ...tie];
    case "fee_desc":
      return [sql`${doctors.consultationFee} desc nulls last`, ...tie];
    case "experience":
      return [sql`${doctors.yearsOfExperience} desc nulls last`, ...tie];
    case "recommended":
    default:
      // Explicit, defensible rule: rating, then number of reviews, then experience, then name.
      return [desc(rating), desc(count), sql`${doctors.yearsOfExperience} desc nulls last`, ...tie];
  }
}

interface CardRow {
  id: string;
  slug: string;
  firstName: string;
  lastName: string;
  profileImage: string | null;
  qualifications: string[] | null;
  yearsOfExperience: number | null;
  consultationFee: string | null;
  avgRating: string | null;
  reviewCount: number | null;
}

/**
 * Turns a page of doctor rows into card DTOs with FOUR constant-count batch
 * queries (specialties, affiliations, availability, favorites) — never one
 * query per doctor.
 */
async function hydrateCards(
  rows: CardRow[],
  viewer: DirectoryViewer | null,
): Promise<PublicDoctorCard[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const [specRows, hospRows, availRows, favRows] = await Promise.all([
    db
      .select({
        doctorId: doctorSpecialties.doctorId,
        name: specialties.name,
        slug: specialties.slug,
        isPrimary: doctorSpecialties.isPrimary,
      })
      .from(doctorSpecialties)
      .innerJoin(specialties, eq(specialties.id, doctorSpecialties.specialtyId))
      .where(inArray(doctorSpecialties.doctorId, ids))
      .orderBy(desc(doctorSpecialties.isPrimary), asc(specialties.name)),
    db
      .select({
        doctorId: hospitalDoctors.doctorId,
        id: hospitals.id,
        slug: hospitals.slug,
        name: hospitals.name,
        city: hospitals.city,
        department: hospitalDoctors.department,
        isPrimary: hospitalDoctors.isPrimary,
      })
      .from(hospitalDoctors)
      .innerJoin(hospitals, eq(hospitals.id, hospitalDoctors.hospitalId))
      .where(and(inArray(hospitalDoctors.doctorId, ids), PUBLIC_HOSPITAL_CONDITION))
      .orderBy(desc(hospitalDoctors.isPrimary), asc(hospitals.name)),
    db
      .select({
        doctorId: doctorAvailability.doctorId,
        consultationType: doctorAvailability.consultationType,
      })
      .from(doctorAvailability)
      .where(and(inArray(doctorAvailability.doctorId, ids), eq(doctorAvailability.isActive, true)))
      .groupBy(doctorAvailability.doctorId, doctorAvailability.consultationType),
    viewer?.role === "PATIENT"
      ? db
          .select({ doctorId: favoriteDoctors.doctorId })
          .from(favoriteDoctors)
          .where(
            and(
              eq(favoriteDoctors.patientId, viewer.userId),
              inArray(favoriteDoctors.doctorId, ids),
            ),
          )
      : Promise.resolve([] as { doctorId: string }[]),
  ]);

  const specsBy = new Map<string, PublicSpecialtyRef[]>();
  for (const s of specRows) {
    const list = specsBy.get(s.doctorId) ?? [];
    list.push({ name: s.name, slug: s.slug, isPrimary: s.isPrimary });
    specsBy.set(s.doctorId, list);
  }
  const hospBy = new Map<string, PublicHospitalRef[]>();
  for (const h of hospRows) {
    const list = hospBy.get(h.doctorId) ?? [];
    list.push({
      id: h.id,
      slug: h.slug,
      name: h.name,
      city: h.city,
      department: h.department,
      isPrimary: h.isPrimary,
    });
    hospBy.set(h.doctorId, list);
  }
  const modesBy = new Map<string, Set<ConsultationMode>>();
  for (const a of availRows) {
    const set = modesBy.get(a.doctorId) ?? new Set<ConsultationMode>();
    set.add(a.consultationType);
    modesBy.set(a.doctorId, set);
  }
  const favSet = new Set(favRows.map((f) => f.doctorId));
  const isPatient = viewer?.role === "PATIENT";

  return rows.map((r) => {
    const specs = specsBy.get(r.id) ?? [];
    const modes = [...(modesBy.get(r.id) ?? [])].sort();
    const { rating, reviewCount } = toRating(r.avgRating, r.reviewCount);
    return {
      id: r.id,
      slug: r.slug,
      name: doctorName(r.firstName, r.lastName),
      profileImage: r.profileImage,
      primarySpecialty: (specs.find((s) => s.isPrimary) ?? specs[0])?.name ?? null,
      specialties: specs,
      qualifications: r.qualifications ?? [],
      yearsOfExperience: r.yearsOfExperience,
      consultationFee: r.consultationFee,
      rating,
      reviewCount,
      hospitals: hospBy.get(r.id) ?? [],
      modes,
      hasSchedule: modesBy.has(r.id),
      isFavorite: isPatient ? favSet.has(r.id) : null,
    };
  });
}

/** Search/filter/sort/paginate the public doctor directory entirely in SQL. */
export async function searchPublicDoctors(
  filters: DoctorSearchInput,
  viewer: DirectoryViewer | null,
): Promise<Paginated<PublicDoctorCard>> {
  const ratingAgg = doctorRatingAggregate();
  const where = and(...buildConditions(filters, ratingAgg));

  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(doctors)
    .innerJoin(users, eq(users.id, doctors.userId))
    .leftJoin(ratingAgg, eq(ratingAgg.doctorId, doctors.id))
    .where(where);

  const total = countRow?.total ?? 0;
  const pageSize = filters.pageSize;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(filters.page, totalPages);

  const rows = await db
    .select({
      id: doctors.id,
      slug: doctors.slug,
      firstName: doctors.firstName,
      lastName: doctors.lastName,
      profileImage: doctors.profileImage,
      qualifications: doctors.qualifications,
      yearsOfExperience: doctors.yearsOfExperience,
      consultationFee: doctors.consultationFee,
      avgRating: ratingAgg.avgRating,
      reviewCount: ratingAgg.reviewCount,
    })
    .from(doctors)
    .innerJoin(users, eq(users.id, doctors.userId))
    .leftJoin(ratingAgg, eq(ratingAgg.doctorId, doctors.id))
    .where(where)
    .orderBy(...buildOrderBy(filters.sort, ratingAgg))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return { items: await hydrateCards(rows, viewer), page, pageSize, total, totalPages };
}

/** Cards for specific ids, restricted to publicly visible doctors (used by favorites + hospital pages). */
export async function getPublicDoctorCardsByIds(
  ids: string[],
  viewer: DirectoryViewer | null,
): Promise<PublicDoctorCard[]> {
  if (ids.length === 0) return [];
  const ratingAgg = doctorRatingAggregate();
  const rows = await db
    .select({
      id: doctors.id,
      slug: doctors.slug,
      firstName: doctors.firstName,
      lastName: doctors.lastName,
      profileImage: doctors.profileImage,
      qualifications: doctors.qualifications,
      yearsOfExperience: doctors.yearsOfExperience,
      consultationFee: doctors.consultationFee,
      avgRating: ratingAgg.avgRating,
      reviewCount: ratingAgg.reviewCount,
    })
    .from(doctors)
    .innerJoin(users, eq(users.id, doctors.userId))
    .leftJoin(ratingAgg, eq(ratingAgg.doctorId, doctors.id))
    .where(and(PUBLIC_DOCTOR_CONDITION, inArray(doctors.id, ids)))
    .orderBy(asc(doctors.lastName), asc(doctors.firstName), asc(doctors.id));
  return hydrateCards(rows, viewer);
}

/** Real filter values only — specialties/cities/hospitals that currently have at least one public doctor. */
export async function getDoctorFilterOptions(): Promise<DoctorFilterOptions> {
  const [specRows, hospRows] = await Promise.all([
    db
      .selectDistinct({ name: specialties.name, slug: specialties.slug })
      .from(doctorSpecialties)
      .innerJoin(specialties, eq(specialties.id, doctorSpecialties.specialtyId))
      .innerJoin(doctors, eq(doctors.id, doctorSpecialties.doctorId))
      .innerJoin(users, eq(users.id, doctors.userId))
      .where(PUBLIC_DOCTOR_CONDITION)
      .orderBy(asc(specialties.name)),
    db
      .selectDistinct({ name: hospitals.name, slug: hospitals.slug, city: hospitals.city })
      .from(hospitalDoctors)
      .innerJoin(hospitals, eq(hospitals.id, hospitalDoctors.hospitalId))
      .innerJoin(doctors, eq(doctors.id, hospitalDoctors.doctorId))
      .innerJoin(users, eq(users.id, doctors.userId))
      .where(and(PUBLIC_DOCTOR_CONDITION, PUBLIC_HOSPITAL_CONDITION))
      .orderBy(asc(hospitals.name)),
  ]);

  const cities = [
    ...new Set(hospRows.map((h) => h.city).filter((c): c is string => Boolean(c))),
  ].sort();
  return {
    specialties: specRows,
    cities,
    hospitals: hospRows.map((h) => ({ name: h.name, slug: h.slug })),
  };
}

function localDateString(offsetDays: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * First bookable slot in the next 14 days, computed by the SAME generator the
 * booking flow uses (Phase 4/5) — so "Next available" is never a guess. Only
 * weekdays that actually have an active rule are scanned.
 */
export async function findNextAvailableSlot(
  doctorId: string,
  scheduledDays: Set<string>,
): Promise<{ date: string; startTime: string } | null> {
  for (let i = 0; i < 14; i++) {
    const date = localDateString(i);
    if (!scheduledDays.has(dayOfWeekFor(date))) continue;
    const slots = await generateSlotsForDate({ doctorId, date });
    const free = slots.find((s) => s.available);
    if (free) return { date, startTime: free.startTime };
  }
  return null;
}

/** Public doctor profile by slug (or UUID for legacy links). Returns null unless the doctor is publicly visible. */
export async function getPublicDoctorByKey(
  key: string,
  viewer: DirectoryViewer | null,
): Promise<PublicDoctorDetail | null> {
  const ratingAgg = doctorRatingAggregate();
  const [row] = await db
    .select({
      id: doctors.id,
      slug: doctors.slug,
      firstName: doctors.firstName,
      lastName: doctors.lastName,
      profileImage: doctors.profileImage,
      qualifications: doctors.qualifications,
      yearsOfExperience: doctors.yearsOfExperience,
      consultationFee: doctors.consultationFee,
      biography: doctors.biography,
      avgRating: ratingAgg.avgRating,
      reviewCount: ratingAgg.reviewCount,
    })
    .from(doctors)
    .innerJoin(users, eq(users.id, doctors.userId))
    .leftJoin(ratingAgg, eq(ratingAgg.doctorId, doctors.id))
    .where(and(PUBLIC_DOCTOR_CONDITION, isUuid(key) ? eq(doctors.id, key) : eq(doctors.slug, key)))
    .limit(1);
  if (!row) return null;

  const [[card], scheduleRows, breakdownRows] = await Promise.all([
    hydrateCards([row], viewer),
    db
      .select({
        dayOfWeek: doctorAvailability.dayOfWeek,
        startTime: doctorAvailability.startTime,
        endTime: doctorAvailability.endTime,
        consultationType: doctorAvailability.consultationType,
        hospitalName: hospitals.name,
      })
      .from(doctorAvailability)
      .leftJoin(hospitals, eq(hospitals.id, doctorAvailability.hospitalId))
      .where(and(eq(doctorAvailability.doctorId, row.id), eq(doctorAvailability.isActive, true))),
    db
      .select({ rating: reviews.rating, n: sql<number>`count(*)::int` })
      .from(reviews)
      .where(and(eq(reviews.doctorId, row.id), eq(reviews.moderationStatus, "PUBLISHED")))
      .groupBy(reviews.rating),
  ]);

  const dayOrder = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
  const schedule: ScheduleWindow[] = scheduleRows
    .map((s) => ({
      dayOfWeek: s.dayOfWeek,
      startTime: s.startTime.slice(0, 5),
      endTime: s.endTime.slice(0, 5),
      consultationType: s.consultationType,
      hospitalName: s.hospitalName,
    }))
    .sort(
      (a, b) =>
        dayOrder.indexOf(a.dayOfWeek) - dayOrder.indexOf(b.dayOfWeek) ||
        a.startTime.localeCompare(b.startTime),
    );

  const breakdown = emptyBreakdown();
  for (const b of breakdownRows) {
    if (b.rating >= 1 && b.rating <= 5) breakdown[b.rating as 1 | 2 | 3 | 4 | 5] = b.n;
  }

  const nextAvailable = await findNextAvailableSlot(
    row.id,
    new Set(schedule.map((s) => s.dayOfWeek)),
  );

  return {
    ...card!,
    biography: row.biography,
    schedule,
    nextAvailable,
    ratingBreakdown: breakdown,
  };
}

/** Upper bound helper used by callers that want "top N" without the count query. */
export async function listFeaturedDoctors(
  limit: number,
  viewer: DirectoryViewer | null,
): Promise<PublicDoctorCard[]> {
  const result = await searchPublicDoctors(
    {
      sort: "recommended",
      page: 1,
      pageSize: Math.min(Math.max(limit, 1), 50),
    } as DoctorSearchInput,
    viewer,
  );
  return result.items;
}
