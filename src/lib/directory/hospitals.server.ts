import "@tanstack/react-start/server-only";

import { and, asc, desc, eq, exists, ilike, inArray, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  doctors,
  favoriteHospitals,
  hospitalDepartments,
  hospitalDoctors,
  hospitals,
  hospitalServices,
  hospitalSpecialties,
  reviews,
  specialties,
  users,
} from "@/db/schema";
import { emptyBreakdown, hospitalRatingAggregate, toRating } from "@/lib/reviews/aggregate.server";
import type { HospitalSearchInput } from "@/lib/validation/directory";

import { getPublicDoctorCardsByIds } from "./doctors.server";
import type {
  DirectoryViewer,
  HospitalFilterOptions,
  Paginated,
  PublicHospitalCard,
  PublicHospitalDetail,
} from "./types";
import {
  escapeLike,
  isUuid,
  PUBLIC_DOCTOR_CONDITION,
  PUBLIC_HOSPITAL_CONDITION,
  searchTerms,
} from "./visibility.server";

const one = sql`1`;

/** Count of PUBLIC doctors per hospital, as a joinable subquery (suspended doctors are not counted). */
function doctorCountAggregate() {
  return db
    .select({
      hospitalId: hospitalDoctors.hospitalId,
      doctorCount: sql<number>`count(*)::int`.as("doctor_count"),
    })
    .from(hospitalDoctors)
    .innerJoin(doctors, eq(doctors.id, hospitalDoctors.doctorId))
    .innerJoin(users, eq(users.id, doctors.userId))
    .where(PUBLIC_DOCTOR_CONDITION)
    .groupBy(hospitalDoctors.hospitalId)
    .as("hospital_doctor_counts");
}

function buildConditions(f: HospitalSearchInput): SQL[] {
  const c: SQL[] = [PUBLIC_HOSPITAL_CONDITION];

  for (const term of searchTerms(f.q)) {
    const pat = `%${escapeLike(term)}%`;
    c.push(
      or(
        ilike(hospitals.name, pat),
        ilike(hospitals.city, pat),
        ilike(hospitals.address, pat),
        exists(
          db
            .select({ x: one })
            .from(hospitalSpecialties)
            .innerJoin(specialties, eq(specialties.id, hospitalSpecialties.specialtyId))
            .where(
              and(eq(hospitalSpecialties.hospitalId, hospitals.id), ilike(specialties.name, pat)),
            ),
        ),
        exists(
          db
            .select({ x: one })
            .from(hospitalDepartments)
            .where(
              and(
                eq(hospitalDepartments.hospitalId, hospitals.id),
                eq(hospitalDepartments.isActive, true),
                ilike(hospitalDepartments.name, pat),
              ),
            ),
        ),
        exists(
          db
            .select({ x: one })
            .from(hospitalServices)
            .where(
              and(
                eq(hospitalServices.hospitalId, hospitals.id),
                eq(hospitalServices.isActive, true),
                ilike(hospitalServices.name, pat),
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
          .from(hospitalSpecialties)
          .innerJoin(specialties, eq(specialties.id, hospitalSpecialties.specialtyId))
          .where(
            and(
              eq(hospitalSpecialties.hospitalId, hospitals.id),
              eq(specialties.slug, f.specialty),
            ),
          ),
      ),
    );
  }
  if (f.city) c.push(sql`lower(${hospitals.city}) = lower(${f.city})`);
  if (f.department) {
    const pat = `%${escapeLike(f.department)}%`;
    c.push(
      exists(
        db
          .select({ x: one })
          .from(hospitalDepartments)
          .where(
            and(
              eq(hospitalDepartments.hospitalId, hospitals.id),
              eq(hospitalDepartments.isActive, true),
              ilike(hospitalDepartments.name, pat),
            ),
          ),
      ),
    );
  }
  if (f.service) {
    const pat = `%${escapeLike(f.service)}%`;
    c.push(
      exists(
        db
          .select({ x: one })
          .from(hospitalServices)
          .where(
            and(
              eq(hospitalServices.hospitalId, hospitals.id),
              eq(hospitalServices.isActive, true),
              ilike(hospitalServices.name, pat),
            ),
          ),
      ),
    );
  }
  return c;
}

interface HospitalRow {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  coverImage: string | null;
  city: string | null;
  address: string | null;
  avgRating: string | null;
  reviewCount: number | null;
  doctorCount: number | null;
}

async function hydrateHospitalCards(
  rows: HospitalRow[],
  viewer: DirectoryViewer | null,
): Promise<PublicHospitalCard[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [specRows, deptRows, favRows] = await Promise.all([
    db
      .select({ hospitalId: hospitalSpecialties.hospitalId, name: specialties.name })
      .from(hospitalSpecialties)
      .innerJoin(specialties, eq(specialties.id, hospitalSpecialties.specialtyId))
      .where(inArray(hospitalSpecialties.hospitalId, ids))
      .orderBy(asc(specialties.name)),
    db
      .select({ hospitalId: hospitalDepartments.hospitalId, name: hospitalDepartments.name })
      .from(hospitalDepartments)
      .where(
        and(inArray(hospitalDepartments.hospitalId, ids), eq(hospitalDepartments.isActive, true)),
      )
      .orderBy(asc(hospitalDepartments.name)),
    viewer?.role === "PATIENT"
      ? db
          .select({ hospitalId: favoriteHospitals.hospitalId })
          .from(favoriteHospitals)
          .where(
            and(
              eq(favoriteHospitals.patientId, viewer.userId),
              inArray(favoriteHospitals.hospitalId, ids),
            ),
          )
      : Promise.resolve([] as { hospitalId: string }[]),
  ]);

  const group = (list: { hospitalId: string; name: string }[]) => {
    const m = new Map<string, string[]>();
    for (const r of list) m.set(r.hospitalId, [...(m.get(r.hospitalId) ?? []), r.name]);
    return m;
  };
  const specBy = group(specRows);
  const deptBy = group(deptRows);
  const favSet = new Set(favRows.map((f) => f.hospitalId));
  const isPatient = viewer?.role === "PATIENT";

  return rows.map((r) => {
    const { rating, reviewCount } = toRating(r.avgRating, r.reviewCount);
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      logo: r.logo,
      coverImage: r.coverImage,
      city: r.city,
      address: r.address,
      rating,
      reviewCount,
      doctorCount: r.doctorCount ?? 0,
      specialties: specBy.get(r.id) ?? [],
      departments: deptBy.get(r.id) ?? [],
      isFavorite: isPatient ? favSet.has(r.id) : null,
    };
  });
}

function cardSelect(
  ratingAgg: ReturnType<typeof hospitalRatingAggregate>,
  counts: ReturnType<typeof doctorCountAggregate>,
) {
  return {
    id: hospitals.id,
    slug: hospitals.slug,
    name: hospitals.name,
    logo: hospitals.logo,
    coverImage: hospitals.coverImage,
    city: hospitals.city,
    address: hospitals.address,
    avgRating: ratingAgg.avgRating,
    reviewCount: ratingAgg.reviewCount,
    doctorCount: counts.doctorCount,
  };
}

export async function searchPublicHospitals(
  filters: HospitalSearchInput,
  viewer: DirectoryViewer | null,
): Promise<Paginated<PublicHospitalCard>> {
  const ratingAgg = hospitalRatingAggregate();
  const counts = doctorCountAggregate();
  const where = and(...buildConditions(filters));

  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(hospitals)
    .where(where);
  const total = countRow?.total ?? 0;
  const pageSize = filters.pageSize;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(filters.page, totalPages);

  const rating = sql`coalesce(${ratingAgg.avgRating}, 0)`;
  const reviewsN = sql`coalesce(${ratingAgg.reviewCount}, 0)`;
  const doctorsN = sql`coalesce(${counts.doctorCount}, 0)`;
  const tie = [asc(hospitals.name), asc(hospitals.id)];
  const orderBy =
    filters.sort === "name"
      ? tie
      : filters.sort === "doctors"
        ? [desc(doctorsN), ...tie]
        : filters.sort === "reviews"
          ? [desc(reviewsN), desc(rating), ...tie]
          : // "recommended" and "rating": rating, then review count, then name.
            [desc(rating), desc(reviewsN), ...tie];

  const rows = await db
    .select(cardSelect(ratingAgg, counts))
    .from(hospitals)
    .leftJoin(ratingAgg, eq(ratingAgg.hospitalId, hospitals.id))
    .leftJoin(counts, eq(counts.hospitalId, hospitals.id))
    .where(where)
    .orderBy(...orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return { items: await hydrateHospitalCards(rows, viewer), page, pageSize, total, totalPages };
}

export async function getPublicHospitalCardsByIds(
  ids: string[],
  viewer: DirectoryViewer | null,
): Promise<PublicHospitalCard[]> {
  if (ids.length === 0) return [];
  const ratingAgg = hospitalRatingAggregate();
  const counts = doctorCountAggregate();
  const rows = await db
    .select(cardSelect(ratingAgg, counts))
    .from(hospitals)
    .leftJoin(ratingAgg, eq(ratingAgg.hospitalId, hospitals.id))
    .leftJoin(counts, eq(counts.hospitalId, hospitals.id))
    .where(and(PUBLIC_HOSPITAL_CONDITION, inArray(hospitals.id, ids)))
    .orderBy(asc(hospitals.name), asc(hospitals.id));
  return hydrateHospitalCards(rows, viewer);
}

export async function getHospitalFilterOptions(): Promise<HospitalFilterOptions> {
  const [specRows, cityRows, deptRows, svcRows] = await Promise.all([
    db
      .selectDistinct({ name: specialties.name, slug: specialties.slug })
      .from(hospitalSpecialties)
      .innerJoin(specialties, eq(specialties.id, hospitalSpecialties.specialtyId))
      .innerJoin(hospitals, eq(hospitals.id, hospitalSpecialties.hospitalId))
      .where(PUBLIC_HOSPITAL_CONDITION)
      .orderBy(asc(specialties.name)),
    db
      .selectDistinct({ city: hospitals.city })
      .from(hospitals)
      .where(PUBLIC_HOSPITAL_CONDITION)
      .orderBy(asc(hospitals.city)),
    db
      .selectDistinct({ name: hospitalDepartments.name })
      .from(hospitalDepartments)
      .innerJoin(hospitals, eq(hospitals.id, hospitalDepartments.hospitalId))
      .where(and(PUBLIC_HOSPITAL_CONDITION, eq(hospitalDepartments.isActive, true)))
      .orderBy(asc(hospitalDepartments.name))
      .limit(100),
    db
      .selectDistinct({ name: hospitalServices.name })
      .from(hospitalServices)
      .innerJoin(hospitals, eq(hospitals.id, hospitalServices.hospitalId))
      .where(and(PUBLIC_HOSPITAL_CONDITION, eq(hospitalServices.isActive, true)))
      .orderBy(asc(hospitalServices.name))
      .limit(100),
  ]);
  return {
    specialties: specRows,
    cities: cityRows.map((r) => r.city).filter((c): c is string => Boolean(c)),
    departments: deptRows.map((r) => r.name),
    services: svcRows.map((r) => r.name),
  };
}

/**
 * Public hospital profile. Deliberately excludes: hospital admins, staff,
 * billing, patients, appointments, verification reason/history, and any
 * internal admin data. Affiliated doctors are limited to PUBLIC doctors.
 */
export async function getPublicHospitalByKey(
  key: string,
  viewer: DirectoryViewer | null,
): Promise<PublicHospitalDetail | null> {
  const ratingAgg = hospitalRatingAggregate();
  const counts = doctorCountAggregate();
  const [row] = await db
    .select({
      ...cardSelect(ratingAgg, counts),
      description: hospitals.description,
      country: hospitals.country,
      phone: hospitals.phone,
      email: hospitals.email,
      openingHours: hospitals.openingHours,
      facilities: hospitals.facilities,
    })
    .from(hospitals)
    .leftJoin(ratingAgg, eq(ratingAgg.hospitalId, hospitals.id))
    .leftJoin(counts, eq(counts.hospitalId, hospitals.id))
    .where(
      and(PUBLIC_HOSPITAL_CONDITION, isUuid(key) ? eq(hospitals.id, key) : eq(hospitals.slug, key)),
    )
    .limit(1);
  if (!row) return null;

  const [[card], deptRows, svcRows, affiliationRows, breakdownRows] = await Promise.all([
    hydrateHospitalCards([row], viewer),
    db
      .select({
        name: hospitalDepartments.name,
        description: hospitalDepartments.description,
        location: hospitalDepartments.location,
      })
      .from(hospitalDepartments)
      .where(
        and(eq(hospitalDepartments.hospitalId, row.id), eq(hospitalDepartments.isActive, true)),
      )
      .orderBy(asc(hospitalDepartments.name)),
    db
      .select({
        name: hospitalServices.name,
        description: hospitalServices.description,
        category: hospitalServices.category,
      })
      .from(hospitalServices)
      .where(and(eq(hospitalServices.hospitalId, row.id), eq(hospitalServices.isActive, true)))
      .orderBy(asc(hospitalServices.name)),
    db
      .select({ doctorId: hospitalDoctors.doctorId, department: hospitalDoctors.department })
      .from(hospitalDoctors)
      .where(eq(hospitalDoctors.hospitalId, row.id)),
    db
      .select({ rating: reviews.rating, n: sql<number>`count(*)::int` })
      .from(reviews)
      .where(and(eq(reviews.hospitalId, row.id), eq(reviews.moderationStatus, "PUBLISHED")))
      .groupBy(reviews.rating),
  ]);

  // Only PUBLIC doctors are returned; suspended/pending ones silently drop out.
  const doctorCards = await getPublicDoctorCardsByIds(
    affiliationRows.map((a) => a.doctorId),
    viewer,
  );
  const doctorDepartments: Record<string, string | null> = {};
  for (const a of affiliationRows) doctorDepartments[a.doctorId] = a.department;

  const breakdown = emptyBreakdown();
  for (const b of breakdownRows) {
    if (b.rating >= 1 && b.rating <= 5) breakdown[b.rating as 1 | 2 | 3 | 4 | 5] = b.n;
  }

  return {
    ...card!,
    description: row.description,
    country: row.country,
    phone: row.phone,
    email: row.email,
    openingHours: row.openingHours,
    facilities: row.facilities ?? [],
    departmentDetails: deptRows,
    services: svcRows,
    doctors: doctorCards,
    doctorDepartments,
    ratingBreakdown: breakdown,
  };
}

export async function listFeaturedHospitals(
  limit: number,
  viewer: DirectoryViewer | null,
): Promise<PublicHospitalCard[]> {
  const result = await searchPublicHospitals(
    {
      sort: "recommended",
      page: 1,
      pageSize: Math.min(Math.max(limit, 1), 50),
    } as HospitalSearchInput,
    viewer,
  );
  return result.items;
}
