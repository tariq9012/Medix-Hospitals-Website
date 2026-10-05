import { pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { doctors } from "./doctors";
import { hospitals } from "./hospitals";
import { users } from "./users";

export const favoriteDoctors = pgTable(
  "favorite_doctors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    doctorId: uuid("doctor_id")
      .notNull()
      .references(() => doctors.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("favorite_doctors_patient_doctor_unique").on(table.patientId, table.doctorId)],
);

export const favoriteHospitals = pgTable(
  "favorite_hospitals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    hospitalId: uuid("hospital_id")
      .notNull()
      .references(() => hospitals.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("favorite_hospitals_patient_hospital_unique").on(table.patientId, table.hospitalId),
  ],
);

export type FavoriteDoctor = typeof favoriteDoctors.$inferSelect;
export type FavoriteHospital = typeof favoriteHospitals.$inferSelect;
