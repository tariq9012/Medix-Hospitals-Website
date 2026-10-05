import "@tanstack/react-start/server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { hospitalDepartments, hospitalServices } from "@/db/schema";
import { recordAuthAuditEvent } from "@/lib/auth/audit.server";
import type {
  CreateDepartmentInput,
  CreateServiceInput,
  UpdateDepartmentInput,
  UpdateServiceInput,
} from "@/lib/validation/hospital";

import { HospitalError } from "./queries.server";

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "item"
  );
}

/**
 * Every read and write below is filtered by `hospitalId`, which always comes
 * from `resolveHospitalContext()` on the server. A department/service id
 * belonging to another hospital simply doesn't match, so a cross-hospital
 * edit fails as "not found" rather than succeeding.
 */

// --- Departments ---------------------------------------------------------------

export async function listDepartments(hospitalId: string) {
  return db
    .select()
    .from(hospitalDepartments)
    .where(eq(hospitalDepartments.hospitalId, hospitalId))
    .orderBy(hospitalDepartments.name);
}

export async function createDepartment(
  hospitalId: string,
  actorUserId: string,
  input: CreateDepartmentInput,
) {
  const slug = slugify(input.name);

  const [existing] = await db
    .select({ id: hospitalDepartments.id })
    .from(hospitalDepartments)
    .where(and(eq(hospitalDepartments.hospitalId, hospitalId), eq(hospitalDepartments.slug, slug)))
    .limit(1);
  if (existing) throw new HospitalError("A department with that name already exists.");

  const [created] = await db
    .insert(hospitalDepartments)
    .values({
      hospitalId,
      name: input.name,
      slug,
      description: input.description,
      phoneExtension: input.phoneExtension,
      location: input.location,
    })
    .returning();

  if (!created) throw new HospitalError("Could not create the department.");

  await recordAuthAuditEvent({
    actorUserId,
    action: "HOSPITAL_DEPARTMENT_CREATED",
    entityId: created.id,
    metadata: { hospitalId, name: input.name },
  });

  return created;
}

export async function updateDepartment(
  hospitalId: string,
  actorUserId: string,
  input: UpdateDepartmentInput,
) {
  const [updated] = await db
    .update(hospitalDepartments)
    .set({
      ...input.patch,
      ...(input.patch.name ? { slug: slugify(input.patch.name) } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(hospitalDepartments.id, input.departmentId),
        eq(hospitalDepartments.hospitalId, hospitalId),
      ),
    )
    .returning();

  if (!updated) throw new HospitalError("Department not found.");

  await recordAuthAuditEvent({
    actorUserId,
    action: "HOSPITAL_DEPARTMENT_UPDATED",
    entityId: updated.id,
    metadata: { hospitalId, changedFields: Object.keys(input.patch) },
  });

  return updated;
}

/** Departments are disabled rather than deleted — see hospital-departments.ts. */
export async function toggleDepartment(
  hospitalId: string,
  actorUserId: string,
  departmentId: string,
  isActive: boolean,
) {
  const [updated] = await db
    .update(hospitalDepartments)
    .set({ isActive, updatedAt: new Date() })
    .where(
      and(eq(hospitalDepartments.id, departmentId), eq(hospitalDepartments.hospitalId, hospitalId)),
    )
    .returning();

  if (!updated) throw new HospitalError("Department not found.");

  await recordAuthAuditEvent({
    actorUserId,
    action: "HOSPITAL_DEPARTMENT_DISABLED",
    entityId: updated.id,
    metadata: { hospitalId, isActive },
  });

  return updated;
}

// --- Services --------------------------------------------------------------------

export async function listServices(hospitalId: string) {
  return db
    .select()
    .from(hospitalServices)
    .where(eq(hospitalServices.hospitalId, hospitalId))
    .orderBy(hospitalServices.name);
}

export async function createService(
  hospitalId: string,
  actorUserId: string,
  input: CreateServiceInput,
) {
  const slug = slugify(input.name);

  const [existing] = await db
    .select({ id: hospitalServices.id })
    .from(hospitalServices)
    .where(and(eq(hospitalServices.hospitalId, hospitalId), eq(hospitalServices.slug, slug)))
    .limit(1);
  if (existing) throw new HospitalError("A service with that name already exists.");

  const [created] = await db
    .insert(hospitalServices)
    .values({
      hospitalId,
      name: input.name,
      slug,
      description: input.description,
      category: input.category,
    })
    .returning();

  if (!created) throw new HospitalError("Could not create the service.");

  await recordAuthAuditEvent({
    actorUserId,
    action: "HOSPITAL_SERVICE_CREATED",
    entityId: created.id,
    metadata: { hospitalId, name: input.name },
  });

  return created;
}

export async function updateService(
  hospitalId: string,
  actorUserId: string,
  input: UpdateServiceInput,
) {
  const [updated] = await db
    .update(hospitalServices)
    .set({
      ...input.patch,
      ...(input.patch.name ? { slug: slugify(input.patch.name) } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(eq(hospitalServices.id, input.serviceId), eq(hospitalServices.hospitalId, hospitalId)),
    )
    .returning();

  if (!updated) throw new HospitalError("Service not found.");

  await recordAuthAuditEvent({
    actorUserId,
    action: "HOSPITAL_SERVICE_UPDATED",
    entityId: updated.id,
    metadata: { hospitalId, changedFields: Object.keys(input.patch) },
  });

  return updated;
}

export async function toggleService(
  hospitalId: string,
  actorUserId: string,
  serviceId: string,
  isActive: boolean,
) {
  const [updated] = await db
    .update(hospitalServices)
    .set({ isActive, updatedAt: new Date() })
    .where(and(eq(hospitalServices.id, serviceId), eq(hospitalServices.hospitalId, hospitalId)))
    .returning();

  if (!updated) throw new HospitalError("Service not found.");

  await recordAuthAuditEvent({
    actorUserId,
    action: "HOSPITAL_SERVICE_DISABLED",
    entityId: updated.id,
    metadata: { hospitalId, isActive },
  });

  return updated;
}
