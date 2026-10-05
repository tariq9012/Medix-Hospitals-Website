import { createServerFn } from "@tanstack/react-start";
import { isRedirect } from "@tanstack/react-router";

import { requireRole } from "@/lib/auth/authorization.server";
import { recordAuthAuditEvent } from "@/lib/auth/audit.server";
import { requireVerifiedDoctorRecord } from "@/lib/doctor/queries.server";
import {
  completePrescriptionSchema,
  createMedicalRecordSchema,
  createPrescriptionSchema,
  medicalRecordIdSchema,
  prescriptionIdSchema,
  updateMedicalRecordSchema,
  updatePrescriptionSchema,
} from "@/lib/validation/clinical";
import { idSchema } from "@/lib/validation/common";
import { z } from "zod";

import { ClinicalError } from "./errors";
import {
  completePrescription,
  createPrescription,
  updatePrescription,
} from "./prescriptions.server";
import {
  getMedicalRecordForAppointment,
  getOwnedDoctorMedicalRecord,
  getOwnedDoctorPrescription,
  getOwnedPatientMedicalRecord,
  getOwnedPatientPrescription,
  getPrescriptionForAppointment,
  listDoctorMedicalRecords,
  listDoctorMedicalRecordsForPatient,
  listDoctorPrescriptions,
  listPatientMedicalRecords,
  listPatientPrescriptions,
} from "./queries.server";
import { createMedicalRecord, updateMedicalRecord } from "./records.server";

/**
 * Same client-safe boundary pattern as every other "functions.ts" module:
 * `createServerFn` compiles each `.handler()` into a server-only chunk, so
 * the database and clinical business logic never reach the browser. Every
 * handler resolves identity itself via `requireRole`/`requireVerifiedDoctorRecord`
 * — no patientId/doctorId is ever accepted as client input for ownership.
 */

interface ActionError {
  message: string;
}
type ActionResult<T extends object> = ({ ok: true } & T) | ({ ok: false } & ActionError);

function toActionError(error: unknown): ActionError {
  if (isRedirect(error)) throw error;
  if (error instanceof ClinicalError) return { message: error.message };
  console.error("[clinical] unexpected error:", error);
  return { message: "Something went wrong. Please try again." };
}

// --- Doctor: medical records --------------------------------------------------

export const listDoctorMedicalRecordsFn = createServerFn({ method: "GET" }).handler(async () => {
  const doctor = await requireVerifiedDoctorRecord();
  try {
    return await listDoctorMedicalRecords(doctor.id);
  } catch (error) {
    console.error("[clinical] listDoctorMedicalRecordsFn failed:", error);
    return [];
  }
});

export const getDoctorMedicalRecordFn = createServerFn({ method: "GET" })
  .validator(medicalRecordIdSchema)
  .handler(async ({ data }) => {
    const doctor = await requireVerifiedDoctorRecord();
    try {
      const record = await getOwnedDoctorMedicalRecord(doctor.id, data.recordId);
      if (record) {
        // Audit successful sensitive detail reads (rule #24). Never audit
        // list-card renders — only an actual detail-page open.
        await recordAuthAuditEvent({
          actorUserId: doctor.userId,
          action: "MEDICAL_RECORD_VIEWED",
          entityType: "medical_record",
          entityId: record.id,
        });
      }
      return record;
    } catch (error) {
      console.error("[clinical] getDoctorMedicalRecordFn failed:", error);
      return null;
    }
  });

export const getMedicalRecordForAppointmentFn = createServerFn({ method: "GET" })
  .validator(z.object({ appointmentId: idSchema }))
  .handler(async ({ data }) => {
    const doctor = await requireVerifiedDoctorRecord();
    try {
      return await getMedicalRecordForAppointment(doctor.id, data.appointmentId);
    } catch (error) {
      console.error("[clinical] getMedicalRecordForAppointmentFn failed:", error);
      return null;
    }
  });

export const listDoctorMedicalRecordsForPatientFn = createServerFn({ method: "GET" })
  .validator(z.object({ patientId: idSchema }))
  .handler(async ({ data }) => {
    const doctor = await requireVerifiedDoctorRecord();
    try {
      return await listDoctorMedicalRecordsForPatient(doctor.id, data.patientId);
    } catch (error) {
      console.error("[clinical] listDoctorMedicalRecordsForPatientFn failed:", error);
      return [];
    }
  });

export const getPrescriptionForAppointmentFn = createServerFn({ method: "GET" })
  .validator(z.object({ appointmentId: idSchema }))
  .handler(async ({ data }) => {
    const doctor = await requireVerifiedDoctorRecord();
    try {
      return await getPrescriptionForAppointment(doctor.id, data.appointmentId);
    } catch (error) {
      console.error("[clinical] getPrescriptionForAppointmentFn failed:", error);
      return null;
    }
  });

export const createMedicalRecordFn = createServerFn({ method: "POST" })
  .validator(createMedicalRecordSchema)
  .handler(async ({ data }): Promise<ActionResult<{ recordId: string }>> => {
    try {
      const doctor = await requireVerifiedDoctorRecord();
      const record = await createMedicalRecord(doctor.id, doctor.userId, data);
      return { ok: true, recordId: record.id };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

export const updateMedicalRecordFn = createServerFn({ method: "POST" })
  .validator(updateMedicalRecordSchema)
  .handler(async ({ data }): Promise<ActionResult<{ recordId: string }>> => {
    try {
      const doctor = await requireVerifiedDoctorRecord();
      const record = await updateMedicalRecord(doctor.id, doctor.userId, data);
      return { ok: true, recordId: record.id };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

// --- Doctor: prescriptions -----------------------------------------------------

export const listDoctorPrescriptionsFn = createServerFn({ method: "GET" }).handler(async () => {
  const doctor = await requireVerifiedDoctorRecord();
  try {
    return await listDoctorPrescriptions(doctor.id);
  } catch (error) {
    console.error("[clinical] listDoctorPrescriptionsFn failed:", error);
    return [];
  }
});

export const getDoctorPrescriptionFn = createServerFn({ method: "GET" })
  .validator(prescriptionIdSchema)
  .handler(async ({ data }) => {
    const doctor = await requireVerifiedDoctorRecord();
    try {
      const prescription = await getOwnedDoctorPrescription(doctor.id, data.prescriptionId);
      if (prescription) {
        await recordAuthAuditEvent({
          actorUserId: doctor.userId,
          action: "PRESCRIPTION_VIEWED",
          entityType: "prescription",
          entityId: prescription.id,
        });
      }
      return prescription;
    } catch (error) {
      console.error("[clinical] getDoctorPrescriptionFn failed:", error);
      return null;
    }
  });

export const createPrescriptionFn = createServerFn({ method: "POST" })
  .validator(createPrescriptionSchema)
  .handler(async ({ data }): Promise<ActionResult<{ prescriptionId: string }>> => {
    try {
      const doctor = await requireVerifiedDoctorRecord();
      const prescription = await createPrescription(doctor.id, doctor.userId, data);
      return { ok: true, prescriptionId: prescription.id };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

export const updatePrescriptionFn = createServerFn({ method: "POST" })
  .validator(updatePrescriptionSchema)
  .handler(async ({ data }): Promise<ActionResult<{ prescriptionId: string }>> => {
    try {
      const doctor = await requireVerifiedDoctorRecord();
      const prescription = await updatePrescription(doctor.id, doctor.userId, data);
      return { ok: true, prescriptionId: prescription.id };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

export const completePrescriptionFn = createServerFn({ method: "POST" })
  .validator(completePrescriptionSchema)
  .handler(async ({ data }): Promise<ActionResult<{ status: string }>> => {
    try {
      const doctor = await requireVerifiedDoctorRecord();
      const prescription = await completePrescription(
        doctor.id,
        doctor.userId,
        data.prescriptionId,
      );
      return { ok: true, status: prescription.status };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

// --- Patient: medical history ---------------------------------------------------

export const listMyMedicalRecordsFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireRole("PATIENT");
  try {
    return await listPatientMedicalRecords(user.id);
  } catch (error) {
    console.error("[clinical] listMyMedicalRecordsFn failed:", error);
    return [];
  }
});

export const getMyMedicalRecordFn = createServerFn({ method: "GET" })
  .validator(medicalRecordIdSchema)
  .handler(async ({ data }) => {
    const user = await requireRole("PATIENT");
    try {
      const record = await getOwnedPatientMedicalRecord(user.id, data.recordId);
      if (record) {
        await recordAuthAuditEvent({
          actorUserId: user.id,
          action: "MEDICAL_RECORD_VIEWED",
          entityType: "medical_record",
          entityId: record.id,
        });
      }
      return record;
    } catch (error) {
      console.error("[clinical] getMyMedicalRecordFn failed:", error);
      return null;
    }
  });

// --- Patient: prescriptions -------------------------------------------------------

export const listMyPrescriptionsFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireRole("PATIENT");
  try {
    return await listPatientPrescriptions(user.id);
  } catch (error) {
    console.error("[clinical] listMyPrescriptionsFn failed:", error);
    return [];
  }
});

export const getMyPrescriptionFn = createServerFn({ method: "GET" })
  .validator(prescriptionIdSchema)
  .handler(async ({ data }) => {
    const user = await requireRole("PATIENT");
    try {
      const prescription = await getOwnedPatientPrescription(user.id, data.prescriptionId);
      if (prescription) {
        await recordAuthAuditEvent({
          actorUserId: user.id,
          action: "PRESCRIPTION_VIEWED",
          entityType: "prescription",
          entityId: prescription.id,
        });
      }
      return prescription;
    } catch (error) {
      console.error("[clinical] getMyPrescriptionFn failed:", error);
      return null;
    }
  });
