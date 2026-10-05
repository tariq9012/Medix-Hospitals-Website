/**
 * Development seed data for local Postgres databases.
 *
 * Run with: npm run db:seed
 *
 * This is DEVELOPMENT-ONLY sample data (specialties, doctors, hospitals, a
 * patient, a hospital admin, and a sample appointment) so the database has
 * something to look at — and log into — while building real features.
 *
 *   - Every seeded account shares one clearly-fake dev-only password
 *     (`DEV_SEED_PASSWORD` below), properly Argon2id-hashed so the real
 *     login flow can be exercised end to end. This is NOT a production
 *     credential and must never be reused outside a local/dev database.
 *   - No ADMIN account is seeded here — see `npm run admin:create`.
 *   - The script refuses to run when NODE_ENV=production AND refuses any
 *     non-local database host unless MEDIX_ALLOW_REMOTE_SEED=true is set
 *     deliberately (see src/db/seed-guard.ts), so it can never accidentally
 *     seed a production or shared database.
 *   - Set SEED_PASSWORD to override the shared dev password (the test
 *     tooling does this from TEST_PASSWORD).
 *
 * The existing UI continues to run on `src/data/mock` — this seed data does
 * NOT replace it. Wiring real pages to the database happens feature-by-
 * feature in later phases.
 */
import "dotenv/config";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "./index";
import { evaluateSeedSafety } from "./seed-guard";
import {
  doctors,
  doctorSpecialties,
  hospitalDoctors,
  hospitals,
  hospitalSpecialties,
  patientProfiles,
  specialties,
  users,
  appointments,
  doctorAvailability,
  hospitalAdmins,
  hospitalDepartments,
  hospitalServices,
  medicalRecords,
  prescriptionItems,
  prescriptions,
  conversations,
  conversationParticipants,
  messages,
  notifications,
  favoriteDoctors,
  favoriteHospitals,
  reviews,
} from "./schema";
import { hashPassword } from "../lib/auth/password.server";
import {
  createInvoiceForAppointment,
  recordPayment,
  recordRefund,
} from "../lib/billing/service.server";

const seedSafety = evaluateSeedSafety(process.env);
if (!seedSafety.allowed) {
  console.error(`${seedSafety.reason} Aborting.`);
  process.exit(1);
}

// DEV-ONLY credential shared by every seeded account below (overridable via
// SEED_PASSWORD). Never usable in production — the guard above prevents the
// seed from running there — and only printed at the end of a seed run.
const DEV_SEED_PASSWORD = process.env["SEED_PASSWORD"] ?? "MedixDev#2026";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Insert a row, ignoring a unique-constraint conflict; if the row already
 * existed (so nothing was returned), re-fetch it by its unique key. This
 * keeps the whole script safe to re-run against the same dev database.
 */
async function upsertByUnique<T>(
  insert: () => Promise<T[]>,
  fetchExisting: () => Promise<T[]>,
): Promise<T | undefined> {
  const inserted = await insert();
  if (inserted[0]) return inserted[0];
  const existing = await fetchExisting();
  return existing[0];
}

const SPECIALTY_NAMES = [
  "Cardiology",
  "Dermatology",
  "Neurology",
  "Orthopedics",
  "Pediatrics",
  "Psychiatry",
  "ENT",
  "Ophthalmology",
  "Gynecology",
  "Dentistry",
  "General Medicine",
];

/**
 * Phase 13 — public directory demo data. Fully idempotent (ON CONFLICT /
 * existence checks, fixed historical dates) and entirely fictional.
 * Adds: qualifications, extra approved doctors with schedules, hospital
 * specialties, completed appointments with reviews, and patient favorites.
 */
async function seedPublicDirectory(
  passwordHash: string,
  specialtyByName: Map<string, typeof specialties.$inferSelect>,
) {
  const hospitalBySlug = async (slug: string) =>
    (await db.select().from(hospitals).where(eq(hospitals.slug, slug)))[0];
  const central = await hospitalBySlug("medix-central-hospital");
  const north = await hospitalBySlug("medix-north-clinic");
  if (!central || !north) return;

  // Qualifications for the original doctors (only where still empty).
  const quals: Record<string, string[]> = {
    "dr-ahmed-raza": ["MBBS", "FCPS (Cardiology)"],
    "dr-sara-khan": ["MBBS", "FCPS (Dermatology)"],
    "dr-bilal-ahmed": ["MBBS", "FCPS (Pediatrics)"],
  };
  for (const [slug, q] of Object.entries(quals)) {
    await db
      .update(doctors)
      .set({ qualifications: q })
      .where(and(eq(doctors.slug, slug), isNull(doctors.qualifications)));
  }

  // Hospital specialties.
  const hospSpecs: [typeof central, string][] = [
    [central, "Dermatology"],
    [central, "Neurology"],
    [north, "Pediatrics"],
    [north, "Orthopedics"],
  ];
  for (const [h, name] of hospSpecs) {
    const sp = specialtyByName.get(name);
    if (sp) {
      await db
        .insert(hospitalSpecialties)
        .values({ hospitalId: h.id, specialtyId: sp.id })
        .onConflictDoNothing();
    }
  }

  // Extra approved public doctors.
  const extra = [
    {
      email: "dr.hina.malik@medix.example",
      first: "Hina",
      last: "Malik",
      spec: "Neurology",
      years: 10,
      fee: "3500.00",
      hospital: central,
      quals: ["MBBS", "FCPS (Neurology)"],
    },
    {
      email: "dr.usman.tariq@medix.example",
      first: "Usman",
      last: "Tariq",
      spec: "Orthopedics",
      years: 18,
      fee: "4000.00",
      hospital: north,
      quals: ["MBBS", "MS (Orthopedics)"],
    },
    {
      email: "dr.ayesha.siddiqui@medix.example",
      first: "Ayesha",
      last: "Siddiqui",
      spec: "General Medicine",
      years: 6,
      fee: "1500.00",
      hospital: central,
      quals: ["MBBS", "MRCP"],
    },
  ];
  for (const d of extra) {
    const [existingUser] = await db.select().from(users).where(eq(users.email, d.email));
    const user =
      existingUser ??
      (
        await db
          .insert(users)
          .values({ email: d.email, passwordHash, role: "DOCTOR", emailVerified: true })
          .returning()
      )[0]!;
    const slug = slugify(`dr-${d.first}-${d.last}`);
    const [existingDoctor] = await db.select().from(doctors).where(eq(doctors.slug, slug));
    const doctor =
      existingDoctor ??
      (
        await db
          .insert(doctors)
          .values({
            userId: user.id,
            firstName: d.first,
            lastName: d.last,
            slug,
            yearsOfExperience: d.years,
            consultationFee: d.fee,
            qualifications: d.quals,
            verificationStatus: "APPROVED",
            biography: `Dr. ${d.first} ${d.last} is a ${d.spec.toLowerCase()} specialist (fictional development profile).`,
          })
          .returning()
      )[0]!;
    const sp = specialtyByName.get(d.spec);
    if (sp) {
      await db
        .insert(doctorSpecialties)
        .values({ doctorId: doctor.id, specialtyId: sp.id, isPrimary: true })
        .onConflictDoNothing();
    }
    await db
      .insert(hospitalDoctors)
      .values({ hospitalId: d.hospital.id, doctorId: doctor.id, isPrimary: true })
      .onConflictDoNothing();
    const [hasRules] = await db
      .select({ id: doctorAvailability.id })
      .from(doctorAvailability)
      .where(eq(doctorAvailability.doctorId, doctor.id))
      .limit(1);
    if (!hasRules) {
      await db.insert(doctorAvailability).values([
        ...(["MONDAY", "WEDNESDAY", "FRIDAY"] as const).map((dayOfWeek) => ({
          doctorId: doctor.id,
          hospitalId: d.hospital.id,
          dayOfWeek,
          startTime: "10:00",
          endTime: "16:00",
          slotDurationMinutes: 30,
          consultationType: "IN_PERSON" as const,
        })),
        ...(["TUESDAY", "THURSDAY"] as const).map((dayOfWeek) => ({
          doctorId: doctor.id,
          dayOfWeek,
          startTime: "18:00",
          endTime: "20:00",
          slotDurationMinutes: 20,
          consultationType: "ONLINE" as const,
        })),
      ]);
    }
  }

  // Fictional patients.
  async function ensurePatient(email: string, first: string, last: string) {
    const [u] = await db.select().from(users).where(eq(users.email, email));
    const user =
      u ??
      (
        await db
          .insert(users)
          .values({ email, passwordHash, role: "PATIENT", emailVerified: true })
          .returning()
      )[0]!;
    await db
      .insert(patientProfiles)
      .values({ userId: user.id, firstName: first, lastName: last })
      .onConflictDoNothing();
    return user;
  }
  const tariq = (await db.select().from(users).where(eq(users.email, "tariq.khan@example.com")))[0];
  const sana = await ensurePatient("sana.malik@example.com", "Sana", "Malik");
  const omar = await ensurePatient("omar.farooq@example.com", "Omar", "Farooq");

  const doctorBySlug = async (slug: string) =>
    (await db.select().from(doctors).where(eq(doctors.slug, slug)))[0];

  // Completed appointments (fixed past dates) + one published review each.
  async function completedWithReview(opts: {
    patientId: string;
    doctorSlug: string;
    hospitalId: string;
    date: string;
    start: string;
    end: string;
    rating: number;
    comment: string | null;
  }) {
    const doctor = await doctorBySlug(opts.doctorSlug);
    if (!doctor) return;
    const [existing] = await db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.patientId, opts.patientId),
          eq(appointments.doctorId, doctor.id),
          eq(appointments.appointmentDate, opts.date),
          eq(appointments.startTime, opts.start),
        ),
      );
    const appt =
      existing ??
      (
        await db
          .insert(appointments)
          .values({
            patientId: opts.patientId,
            doctorId: doctor.id,
            hospitalId: opts.hospitalId,
            appointmentDate: opts.date,
            startTime: opts.start,
            endTime: opts.end,
            consultationType: "IN_PERSON",
            reasonForVisit: "Consultation (development seed)",
            status: "COMPLETED",
            paymentStatus: "PAID",
            fee: doctor.consultationFee,
          })
          .returning()
      )[0]!;
    await db
      .insert(reviews)
      .values({
        patientId: opts.patientId,
        doctorId: doctor.id,
        hospitalId: opts.hospitalId,
        appointmentId: appt.id,
        rating: opts.rating,
        reviewText: opts.comment,
        moderationStatus: "PUBLISHED",
      })
      .onConflictDoNothing({ target: reviews.appointmentId });
  }

  if (tariq) {
    // Tariq's existing completed appointment with Dr. Raza (from the base seed), if present.
    const raza = await doctorBySlug("dr-ahmed-raza");
    if (raza) {
      const [done] = await db
        .select()
        .from(appointments)
        .where(
          and(
            eq(appointments.patientId, tariq.id),
            eq(appointments.doctorId, raza.id),
            eq(appointments.status, "COMPLETED"),
          ),
        )
        .limit(1);
      if (done) {
        await db
          .insert(reviews)
          .values({
            patientId: tariq.id,
            doctorId: raza.id,
            hospitalId: done.hospitalId,
            appointmentId: done.id,
            rating: 5,
            reviewText: "Very thorough and took time to explain everything clearly.",
            moderationStatus: "PUBLISHED",
          })
          .onConflictDoNothing({ target: reviews.appointmentId });
      }
    }
  }

  await completedWithReview({
    patientId: sana.id,
    doctorSlug: "dr-ahmed-raza",
    hospitalId: central.id,
    date: "2026-08-10",
    start: "10:00",
    end: "10:30",
    rating: 4,
    comment: "Professional and punctual. The wait was a little long.",
  });
  await completedWithReview({
    patientId: omar.id,
    doctorSlug: "dr-ahmed-raza",
    hospitalId: central.id,
    date: "2026-08-12",
    start: "11:00",
    end: "11:30",
    rating: 5,
    comment: null,
  });
  await completedWithReview({
    patientId: sana.id,
    doctorSlug: "dr-sara-khan",
    hospitalId: central.id,
    date: "2026-08-17",
    start: "10:00",
    end: "10:30",
    rating: 5,
    comment: "Clear advice and a treatment plan that actually worked.",
  });
  await completedWithReview({
    patientId: omar.id,
    doctorSlug: "dr-bilal-ahmed",
    hospitalId: north.id,
    date: "2026-09-02",
    start: "10:00",
    end: "10:30",
    rating: 3,
    comment: "Good doctor, but the clinic was crowded.",
  });

  // Favorites.
  const favs: [string | undefined, string][] = [
    [tariq?.id, "dr-ahmed-raza"],
    [sana.id, "dr-sara-khan"],
  ];
  for (const [patientId, slug] of favs) {
    const doctor = await doctorBySlug(slug);
    if (patientId && doctor) {
      await db
        .insert(favoriteDoctors)
        .values({ patientId, doctorId: doctor.id })
        .onConflictDoNothing();
    }
  }
  if (tariq) {
    await db
      .insert(favoriteHospitals)
      .values({ patientId: tariq.id, hospitalId: central.id })
      .onConflictDoNothing();
  }
}

async function main() {
  console.log("Seeding development data...");
  const devPasswordHash = await hashPassword(DEV_SEED_PASSWORD);

  const insertedSpecialties = await db
    .insert(specialties)
    .values(SPECIALTY_NAMES.map((name) => ({ name, slug: slugify(name) })))
    .onConflictDoNothing()
    .returning();

  const specialtyByName = new Map(
    (insertedSpecialties.length > 0
      ? insertedSpecialties
      : await db.select().from(specialties)
    ).map((s) => [s.name, s]),
  );

  // --- Hospitals -------------------------------------------------------
  const hospitalOne = await upsertByUnique(
    () =>
      db
        .insert(hospitals)
        .values({
          name: "Medix Central Hospital",
          slug: "medix-central-hospital",
          description: "A full-service general hospital with 24/7 emergency care.",
          phone: "+92-300-0000000",
          email: "info@medixcentral.example",
          address: "123 Health Avenue",
          city: "Karachi",
          country: "Pakistan",
          verificationStatus: "APPROVED",
          facilities: ["24/7 Emergency", "ICU", "Pharmacy", "Laboratory"],
        })
        .onConflictDoNothing()
        .returning(),
    () => db.select().from(hospitals).where(eq(hospitals.slug, "medix-central-hospital")),
  );

  const hospitalTwo = await upsertByUnique(
    () =>
      db
        .insert(hospitals)
        .values({
          name: "Medix North Clinic",
          slug: "medix-north-clinic",
          description: "An outpatient clinic focused on primary and specialty care.",
          phone: "+92-300-1111111",
          email: "info@medixnorth.example",
          address: "45 Wellness Road",
          city: "Lahore",
          country: "Pakistan",
          verificationStatus: "APPROVED",
          facilities: ["Pharmacy", "Radiology"],
        })
        .onConflictDoNothing()
        .returning(),
    () => db.select().from(hospitals).where(eq(hospitals.slug, "medix-north-clinic")),
  );

  if (hospitalOne) {
    const cardiology = specialtyByName.get("Cardiology");
    const generalMedicine = specialtyByName.get("General Medicine");
    if (cardiology) {
      await db
        .insert(hospitalSpecialties)
        .values({ hospitalId: hospitalOne.id, specialtyId: cardiology.id })
        .onConflictDoNothing();
    }
    if (generalMedicine) {
      await db
        .insert(hospitalSpecialties)
        .values({ hospitalId: hospitalOne.id, specialtyId: generalMedicine.id })
        .onConflictDoNothing();
    }
  }

  // --- Doctors -----------------------------------------------------------
  const doctorSeeds = [
    {
      email: "dr.ahmed.raza@medix.example",
      firstName: "Ahmed",
      lastName: "Raza",
      specialty: "Cardiology",
      yearsOfExperience: 12,
      consultationFee: "3000.00",
      hospital: hospitalOne,
    },
    {
      email: "dr.sara.khan@medix.example",
      firstName: "Sara",
      lastName: "Khan",
      specialty: "Dermatology",
      yearsOfExperience: 8,
      consultationFee: "2500.00",
      hospital: hospitalOne,
    },
    {
      email: "dr.bilal.ahmed@medix.example",
      firstName: "Bilal",
      lastName: "Ahmed",
      specialty: "Pediatrics",
      yearsOfExperience: 15,
      consultationFee: "2000.00",
      hospital: hospitalTwo,
    },
  ] as const;

  const createdDoctors: (typeof doctors.$inferSelect)[] = [];

  for (const seed of doctorSeeds) {
    const doctorUser = await upsertByUnique(
      () =>
        db
          .insert(users)
          .values({
            email: seed.email,
            passwordHash: devPasswordHash,
            role: "DOCTOR",
            emailVerified: true,
          })
          .onConflictDoNothing()
          .returning(),
      () => db.select().from(users).where(eq(users.email, seed.email)),
    );

    if (!doctorUser) continue;

    const doctorSlug = slugify(`dr-${seed.firstName}-${seed.lastName}`);
    const doctor = await upsertByUnique(
      () =>
        db
          .insert(doctors)
          .values({
            userId: doctorUser.id,
            firstName: seed.firstName,
            lastName: seed.lastName,
            slug: doctorSlug,
            yearsOfExperience: seed.yearsOfExperience,
            consultationFee: seed.consultationFee,
            verificationStatus: "APPROVED",
            biography: `Dr. ${seed.firstName} ${seed.lastName} is a ${seed.specialty.toLowerCase()} specialist.`,
          })
          .onConflictDoNothing()
          .returning(),
      () => db.select().from(doctors).where(eq(doctors.slug, doctorSlug)),
    );

    if (!doctor) continue;
    createdDoctors.push(doctor);

    const specialty = specialtyByName.get(seed.specialty);
    if (specialty) {
      await db
        .insert(doctorSpecialties)
        .values({ doctorId: doctor.id, specialtyId: specialty.id, isPrimary: true })
        .onConflictDoNothing();
    }

    if (seed.hospital) {
      await db
        .insert(hospitalDoctors)
        .values({ hospitalId: seed.hospital.id, doctorId: doctor.id, isPrimary: true })
        .onConflictDoNothing();
    }

    // Mon–Fri, 9am–5pm in-person (with a lunch break) at the doctor's
    // hospital, plus a Mon/Wed/Fri online slot — enough for the booking
    // flow to have real, generatable slots to test against.
    const existingAvailability = await db
      .select({ id: doctorAvailability.id })
      .from(doctorAvailability)
      .where(eq(doctorAvailability.doctorId, doctor.id))
      .limit(1);

    if (existingAvailability.length === 0) {
      const weekdays = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] as const;
      await db.insert(doctorAvailability).values(
        weekdays.map((dayOfWeek) => ({
          doctorId: doctor.id,
          hospitalId: seed.hospital?.id,
          dayOfWeek,
          startTime: "09:00",
          endTime: "17:00",
          slotDurationMinutes: 30,
          consultationType: "IN_PERSON" as const,
          breakStartTime: "13:00",
          breakEndTime: "14:00",
        })),
      );
      await db.insert(doctorAvailability).values(
        (["MONDAY", "WEDNESDAY", "FRIDAY"] as const).map((dayOfWeek) => ({
          doctorId: doctor.id,
          dayOfWeek,
          startTime: "18:00",
          endTime: "20:00",
          slotDurationMinutes: 20,
          consultationType: "ONLINE" as const,
        })),
      );
    }
  }

  // --- One patient ---------------------------------------------------------
  const patientUser = await upsertByUnique(
    () =>
      db
        .insert(users)
        .values({
          email: "tariq.khan@example.com",
          passwordHash: devPasswordHash,
          role: "PATIENT",
          emailVerified: true,
        })
        .onConflictDoNothing()
        .returning(),
    () => db.select().from(users).where(eq(users.email, "tariq.khan@example.com")),
  );

  if (patientUser) {
    await db
      .insert(patientProfiles)
      .values({
        userId: patientUser.id,
        firstName: "Tariq",
        lastName: "Khan",
        phone: "+92-300-2222222",
        city: "Karachi",
        country: "Pakistan",
      })
      .onConflictDoNothing();

    // --- Sample appointments (a spread of statuses for testing the doctor
    // portal's status transitions) --------------------------------------
    const firstDoctor = createdDoctors[0];
    if (firstDoctor) {
      const [existingAppointment] = await db
        .select()
        .from(appointments)
        .where(eq(appointments.patientId, patientUser.id));

      if (!existingAppointment) {
        const today = new Date();
        const isoOffset = (days: number) =>
          new Date(today.getFullYear(), today.getMonth(), today.getDate() + days)
            .toISOString()
            .slice(0, 10);

        await db.insert(appointments).values([
          {
            // Upcoming, awaiting doctor confirmation.
            patientId: patientUser.id,
            doctorId: firstDoctor.id,
            hospitalId: hospitalOne?.id,
            appointmentDate: isoOffset(2),
            startTime: "10:00",
            endTime: "10:30",
            consultationType: "IN_PERSON",
            reasonForVisit: "Routine check-up",
            status: "PENDING",
            paymentStatus: "PENDING",
            fee: firstDoctor.consultationFee,
          },
          {
            // Upcoming and already confirmed.
            patientId: patientUser.id,
            doctorId: firstDoctor.id,
            hospitalId: hospitalOne?.id,
            appointmentDate: isoOffset(4),
            startTime: "11:00",
            endTime: "11:30",
            consultationType: "ONLINE",
            reasonForVisit: "Follow-up on blood pressure medication",
            status: "CONFIRMED",
            paymentStatus: "PENDING",
            fee: firstDoctor.consultationFee,
          },
          {
            // In the past and confirmed — eligible to be marked
            // completed/no-show by the doctor, for testing that flow.
            patientId: patientUser.id,
            doctorId: firstDoctor.id,
            hospitalId: hospitalOne?.id,
            appointmentDate: isoOffset(-1),
            startTime: "09:30",
            endTime: "10:00",
            consultationType: "IN_PERSON",
            reasonForVisit: "Chest pain evaluation",
            status: "CONFIRMED",
            paymentStatus: "PENDING",
            fee: firstDoctor.consultationFee,
          },
          {
            // Already completed.
            patientId: patientUser.id,
            doctorId: firstDoctor.id,
            hospitalId: hospitalOne?.id,
            appointmentDate: isoOffset(-14),
            startTime: "14:00",
            endTime: "14:30",
            consultationType: "IN_PERSON",
            reasonForVisit: "Annual physical",
            status: "COMPLETED",
            paymentStatus: "PAID",
            fee: firstDoctor.consultationFee,
          },
        ]);
      }

      // --- Phase 8: clinical record + prescription for the completed
      // appointment above, so the doctor/patient clinical UI has real data
      // to render in dev. Looked up fresh (not reused from the insert
      // above) so this block is idempotent across repeated `db:seed` runs.
      const [completedAppointment] = await db
        .select()
        .from(appointments)
        .where(
          and(
            eq(appointments.patientId, patientUser.id),
            eq(appointments.doctorId, firstDoctor.id),
            eq(appointments.status, "COMPLETED"),
          ),
        )
        .limit(1);

      if (completedAppointment) {
        const [existingRecord] = await db
          .select()
          .from(medicalRecords)
          .where(eq(medicalRecords.appointmentId, completedAppointment.id))
          .limit(1);

        const record =
          existingRecord ??
          (
            await db
              .insert(medicalRecords)
              .values({
                patientId: patientUser.id,
                doctorId: firstDoctor.id,
                appointmentId: completedAppointment.id,
                hospitalId: completedAppointment.hospitalId,
                chiefComplaint: "Routine annual physical, no acute complaints.",
                diagnosis: "Generally healthy; mild seasonal allergic rhinitis.",
                symptoms: ["occasional sneezing", "mild nasal congestion"],
                clinicalNotes:
                  "Vitals within normal limits. Lungs clear on auscultation. No lymphadenopathy.",
                allergies: ["pollen"],
                vitals: {
                  bloodPressure: "118/76",
                  heartRate: "72",
                  temperature: "98.4°F",
                  weight: "71kg",
                },
                treatmentPlan: "Over-the-counter antihistamine as needed during allergy season.",
                followUpInstructions:
                  "Return for annual physical in 12 months, sooner if symptoms worsen.",
                followUpDate: (() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 351);
                  return d.toISOString().slice(0, 10);
                })(),
              })
              // Guards against a rare race with a concurrent seed run — the
              // real safety net is the DB unique index, not this check.
              .onConflictDoNothing({ target: medicalRecords.appointmentId })
              .returning()
          )[0];

        if (record) {
          const [existingPrescription] = await db
            .select()
            .from(prescriptions)
            .where(eq(prescriptions.appointmentId, completedAppointment.id))
            .limit(1);

          if (!existingPrescription) {
            const [prescription] = await db
              .insert(prescriptions)
              .values({
                patientId: patientUser.id,
                doctorId: firstDoctor.id,
                appointmentId: completedAppointment.id,
                medicalRecordId: record.id,
                hospitalId: completedAppointment.hospitalId,
                notes: "Discontinue antihistamine if drowsiness occurs.",
                status: "ACTIVE",
              })
              .returning();

            if (prescription) {
              await db.insert(prescriptionItems).values([
                {
                  prescriptionId: prescription.id,
                  medicineName: "Cetirizine",
                  dosage: "10mg",
                  frequency: "Once daily",
                  duration: "14 days",
                  route: "Oral",
                  instructions: "Take in the evening; may cause mild drowsiness.",
                },
                {
                  prescriptionId: prescription.id,
                  medicineName: "Saline nasal spray",
                  dosage: "2 sprays per nostril",
                  frequency: "Twice daily",
                  duration: "As needed",
                  route: "Nasal",
                  instructions: "Use to relieve nasal congestion.",
                },
              ]);
            }
          }
        }
      }
    }
  }

  // --- Phase 10: one conversation with a couple of fictional plain-text
  // messages, plus a notification, so the messaging UI has real data to
  // render in dev. Idempotent — skips if a conversation already exists.
  const messagingDoctor = createdDoctors[0];
  if (patientUser && messagingDoctor) {
    const [existingConversation] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.patientId, patientUser.id),
          eq(conversations.doctorId, messagingDoctor.id),
        ),
      )
      .limit(1);

    const conversation =
      existingConversation ??
      (
        await db
          .insert(conversations)
          .values({ patientId: patientUser.id, doctorId: messagingDoctor.id })
          .onConflictDoNothing({ target: [conversations.patientId, conversations.doctorId] })
          .returning()
      )[0];

    if (conversation) {
      await db
        .insert(conversationParticipants)
        .values([
          { conversationId: conversation.id, userId: patientUser.id },
          { conversationId: conversation.id, userId: messagingDoctor.userId },
        ])
        .onConflictDoNothing();

      const [existingMessage] = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversation.id))
        .limit(1);

      if (!existingMessage) {
        const [firstMessage] = await db
          .insert(messages)
          .values({
            conversationId: conversation.id,
            senderId: patientUser.id,
            body: "Hi Dr. Raza, just confirming I should keep taking the antihistamine through the weekend?",
          })
          .returning();

        await db.insert(messages).values({
          conversationId: conversation.id,
          senderId: messagingDoctor.userId,
          body: "Yes, that's fine — finish the course and let me know if symptoms don't improve.",
          readAt: new Date(),
        });

        if (firstMessage) {
          await db.insert(notifications).values({
            userId: messagingDoctor.userId,
            type: "NEW_MESSAGE",
            title: "New message",
            message: "You have a new message from your patient.",
            metadata: { conversationId: conversation.id },
          });
        }
      }
    }
  }

  // --- One hospital admin ---------------------------------------------------
  const hospitalAdminUser = await upsertByUnique(
    () =>
      db
        .insert(users)
        .values({
          email: "admin@medixcentral.example",
          passwordHash: devPasswordHash,
          role: "HOSPITAL_ADMIN",
          status: "ACTIVE", // pre-approved dev fixture; real registrations start PENDING_VERIFICATION
          emailVerified: true,
        })
        .onConflictDoNothing()
        .returning(),
    () => db.select().from(users).where(eq(users.email, "admin@medixcentral.example")),
  );

  // Link the hospital admin to their hospital. This relationship is what
  // `requireHospitalAdmin()` resolves — without it the account can't manage
  // anything, which is the intended default.
  if (hospitalAdminUser && hospitalOne) {
    await db
      .insert(hospitalAdmins)
      .values({ userId: hospitalAdminUser.id, hospitalId: hospitalOne.id, isPrimary: true })
      .onConflictDoNothing();
  }

  // --- Phase 12: billing examples (invoice/payment/refund), created
  // through the REAL billing service functions — not raw inserts — so the
  // seed data goes through the same invoice-numbering, status-transition
  // and notification logic as production traffic. Idempotent: each
  // appointment gets at most one invoice regardless of how many times
  // `db:seed` runs, enforced by createInvoiceForAppointment's own
  // onConflictDoNothing on the appointment_id unique index. -------------
  if (createdDoctors[0] && hospitalAdminUser && patientUser) {
    const firstDoctor = createdDoctors[0];
    const [upcomingConfirmed] = await db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.patientId, patientUser.id),
          eq(appointments.doctorId, firstDoctor.id),
          eq(appointments.reasonForVisit, "Follow-up on blood pressure medication"),
        ),
      )
      .limit(1);
    const [pastConfirmed] = await db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.patientId, patientUser.id),
          eq(appointments.doctorId, firstDoctor.id),
          eq(appointments.reasonForVisit, "Chest pain evaluation"),
        ),
      )
      .limit(1);
    const [completed] = await db
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.patientId, patientUser.id),
          eq(appointments.doctorId, firstDoctor.id),
          eq(appointments.reasonForVisit, "Annual physical"),
        ),
      )
      .limit(1);

    // 1. Unpaid invoice — a confirmed but not-yet-paid appointment.
    if (upcomingConfirmed) {
      await db.transaction((tx) => createInvoiceForAppointment(tx, upcomingConfirmed));
    }

    // 2. Partially paid invoice.
    if (pastConfirmed) {
      const invoice = await db.transaction((tx) => createInvoiceForAppointment(tx, pastConfirmed));
      if (invoice.status === "ISSUED") {
        const half = (Number(invoice.total) / 2).toFixed(2);
        await recordPayment({
          actorUserId: hospitalAdminUser.id,
          hospitalIds: [hospitalOne!.id],
          invoiceId: invoice.id,
          amount: half,
          method: "CASH",
        }).catch((error) => console.error("[seed] partial payment example failed:", error));
      }
    }

    // 3. Paid invoice, then partially refunded — demonstrates the full
    //    payment + refund lifecycle in one example.
    if (completed) {
      const invoice = await db.transaction((tx) => createInvoiceForAppointment(tx, completed));
      if (invoice.status === "ISSUED") {
        const paymentResult = await recordPayment({
          actorUserId: hospitalAdminUser.id,
          hospitalIds: [hospitalOne!.id],
          invoiceId: invoice.id,
          amount: invoice.total,
          method: "CASH",
        }).catch((error) => {
          console.error("[seed] full payment example failed:", error);
          return null;
        });
        if (paymentResult) {
          const quarter = (Number(invoice.total) / 4).toFixed(2);
          await recordRefund({
            actorUserId: hospitalAdminUser.id,
            hospitalIds: [hospitalOne!.id],
            paymentId: paymentResult.payment.id,
            amount: quarter,
            reason: "Patient was billed for an add-on service that was not actually performed.",
          }).catch((error) => console.error("[seed] refund example failed:", error));
        }
      }
    }
  }

  // --- Providers in non-approved states, so the admin verification queue
  // has something real to review ------------------------------------------
  const pendingDoctorUser = await upsertByUnique(
    () =>
      db
        .insert(users)
        .values({
          email: "dr.pending.review@medix.example",
          passwordHash: devPasswordHash,
          role: "DOCTOR",
          status: "PENDING_VERIFICATION",
          emailVerified: true,
        })
        .onConflictDoNothing()
        .returning(),
    () => db.select().from(users).where(eq(users.email, "dr.pending.review@medix.example")),
  );

  if (pendingDoctorUser) {
    await db
      .insert(doctors)
      .values({
        userId: pendingDoctorUser.id,
        firstName: "Hina",
        lastName: "Qureshi",
        slug: "dr-hina-qureshi",
        yearsOfExperience: 6,
        consultationFee: "2200.00",
        medicalLicenseNumber: "PMC-DEV-77120",
        biography: "Awaiting verification — seeded so the admin queue has a real pending case.",
        verificationStatus: "PENDING",
        isAvailable: false,
      })
      .onConflictDoNothing();
  }

  await upsertByUnique(
    () =>
      db
        .insert(hospitals)
        .values({
          name: "Riverside Medical Centre",
          slug: "riverside-medical-centre",
          description: "Awaiting verification — seeded for the admin hospital queue.",
          phone: "+92-300-3333333",
          email: "info@riverside.example",
          address: "88 Riverside Road",
          city: "Islamabad",
          country: "Pakistan",
          verificationStatus: "PENDING",
          facilities: ["Laboratory", "Pharmacy"],
        })
        .onConflictDoNothing()
        .returning(),
    () => db.select().from(hospitals).where(eq(hospitals.slug, "riverside-medical-centre")),
  );

  // --- Departments & services for the primary hospital -------------------
  if (hospitalOne) {
    const existingDepartments = await db
      .select({ id: hospitalDepartments.id })
      .from(hospitalDepartments)
      .where(eq(hospitalDepartments.hospitalId, hospitalOne.id))
      .limit(1);

    if (existingDepartments.length === 0) {
      await db.insert(hospitalDepartments).values([
        {
          hospitalId: hospitalOne.id,
          name: "Cardiology",
          slug: "cardiology",
          location: "Block A, 3rd floor",
          phoneExtension: "201",
        },
        {
          hospitalId: hospitalOne.id,
          name: "Emergency",
          slug: "emergency",
          location: "Ground floor",
          phoneExtension: "100",
        },
        {
          hospitalId: hospitalOne.id,
          name: "Radiology",
          slug: "radiology",
          location: "Block B, 1st floor",
          phoneExtension: "310",
        },
      ]);
    }

    const existingServices = await db
      .select({ id: hospitalServices.id })
      .from(hospitalServices)
      .where(eq(hospitalServices.hospitalId, hospitalOne.id))
      .limit(1);

    if (existingServices.length === 0) {
      await db.insert(hospitalServices).values([
        { hospitalId: hospitalOne.id, name: "ECG", slug: "ecg", category: "Diagnostics" },
        {
          hospitalId: hospitalOne.id,
          name: "Blood Testing",
          slug: "blood-testing",
          category: "Laboratory",
        },
        {
          hospitalId: hospitalOne.id,
          name: "24/7 Emergency Care",
          slug: "24-7-emergency-care",
          category: "Emergency",
        },
      ]);
    }
  }

  await seedPublicDirectory(devPasswordHash, specialtyByName);

  console.log("Seed complete.");
  console.log("");
  console.log(
    "DEVELOPMENT-ONLY login credentials (fictional accounts; never use these anywhere real):",
  );
  console.log(`  Password for all seeded accounts: ${DEV_SEED_PASSWORD}`);
  console.log("  Patient:        tariq.khan@example.com");
  console.log("  Doctor:         dr.ahmed.raza@medix.example");
  console.log("  Hospital admin: admin@medixcentral.example");
  console.log(
    "  Pending doctor: dr.pending.review@medix.example  (for admin verification testing)",
  );
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    // `postgres` clients keep the process alive until closed explicitly.
    process.exit(process.exitCode ?? 0);
  });
