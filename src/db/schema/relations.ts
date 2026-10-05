import { relations } from "drizzle-orm";

import { appointments } from "./appointments";
import { auditLogs } from "./audit-logs";
import { authSessions } from "./auth-sessions";
import { doctorAvailability } from "./availability";
import { medicalDocuments } from "./documents";
import { emailVerificationTokens } from "./email-verification-tokens";
import { doctors } from "./doctors";
import { favoriteDoctors, favoriteHospitals } from "./favorites";
import { hospitalDoctors, hospitals } from "./hospitals";
import { hospitalAdmins } from "./hospital-admins";
import { hospitalDepartments } from "./hospital-departments";
import { hospitalServices } from "./hospital-services";
import { medicalRecords } from "./medical-records";
import { conversationParticipants, conversations, messages } from "./messages";
import { notifications } from "./notifications";
import { invoices } from "./billing";
import { payments } from "./payments";
import { refunds } from "./refunds";
import { patientProfiles } from "./profiles";
import { prescriptionItems, prescriptions } from "./prescriptions";
import { passwordResetTokens } from "./password-reset-tokens";
import { reviews } from "./reviews";
import { doctorSpecialties, hospitalSpecialties, specialties } from "./specialties";
import { users } from "./users";

export const usersRelations = relations(users, ({ one, many }) => ({
  patientProfile: one(patientProfiles, {
    fields: [users.id],
    references: [patientProfiles.userId],
  }),
  doctor: one(doctors, { fields: [users.id], references: [doctors.userId] }),
  appointments: many(appointments),
  medicalRecords: many(medicalRecords),
  prescriptions: many(prescriptions),
  medicalDocuments: many(medicalDocuments),
  reviews: many(reviews),
  favoriteDoctors: many(favoriteDoctors),
  favoriteHospitals: many(favoriteHospitals),
  payments: many(payments),
  notifications: many(notifications),
  conversationParticipants: many(conversationParticipants),
  sentMessages: many(messages),
  auditLogEntries: many(auditLogs),
  authSessions: many(authSessions),
  passwordResetTokens: many(passwordResetTokens),
  emailVerificationTokens: many(emailVerificationTokens),
  hospitalAdminRoles: many(hospitalAdmins),
}));

export const patientProfilesRelations = relations(patientProfiles, ({ one }) => ({
  user: one(users, { fields: [patientProfiles.userId], references: [users.id] }),
}));

export const doctorsRelations = relations(doctors, ({ one, many }) => ({
  user: one(users, { fields: [doctors.userId], references: [users.id] }),
  specialties: many(doctorSpecialties),
  hospitals: many(hospitalDoctors),
  availability: many(doctorAvailability),
  appointments: many(appointments),
  medicalRecords: many(medicalRecords),
  prescriptions: many(prescriptions),
  reviews: many(reviews),
  favoritedBy: many(favoriteDoctors),
}));

export const hospitalsRelations = relations(hospitals, ({ many }) => ({
  specialties: many(hospitalSpecialties),
  doctors: many(hospitalDoctors),
  availability: many(doctorAvailability),
  appointments: many(appointments),
  reviews: many(reviews),
  favoritedBy: many(favoriteHospitals),
  admins: many(hospitalAdmins),
  departments: many(hospitalDepartments),
  services: many(hospitalServices),
}));

export const hospitalDoctorsRelations = relations(hospitalDoctors, ({ one }) => ({
  hospital: one(hospitals, { fields: [hospitalDoctors.hospitalId], references: [hospitals.id] }),
  doctor: one(doctors, { fields: [hospitalDoctors.doctorId], references: [doctors.id] }),
}));

export const specialtiesRelations = relations(specialties, ({ many }) => ({
  doctors: many(doctorSpecialties),
  hospitals: many(hospitalSpecialties),
}));

export const doctorSpecialtiesRelations = relations(doctorSpecialties, ({ one }) => ({
  doctor: one(doctors, { fields: [doctorSpecialties.doctorId], references: [doctors.id] }),
  specialty: one(specialties, {
    fields: [doctorSpecialties.specialtyId],
    references: [specialties.id],
  }),
}));

export const hospitalSpecialtiesRelations = relations(hospitalSpecialties, ({ one }) => ({
  hospital: one(hospitals, {
    fields: [hospitalSpecialties.hospitalId],
    references: [hospitals.id],
  }),
  specialty: one(specialties, {
    fields: [hospitalSpecialties.specialtyId],
    references: [specialties.id],
  }),
}));

export const doctorAvailabilityRelations = relations(doctorAvailability, ({ one }) => ({
  doctor: one(doctors, { fields: [doctorAvailability.doctorId], references: [doctors.id] }),
  hospital: one(hospitals, {
    fields: [doctorAvailability.hospitalId],
    references: [hospitals.id],
  }),
}));

export const appointmentsRelations = relations(appointments, ({ one, many }) => ({
  patient: one(users, { fields: [appointments.patientId], references: [users.id] }),
  doctor: one(doctors, { fields: [appointments.doctorId], references: [doctors.id] }),
  hospital: one(hospitals, { fields: [appointments.hospitalId], references: [hospitals.id] }),
  medicalRecords: many(medicalRecords),
  prescriptions: many(prescriptions),
  medicalDocuments: many(medicalDocuments),
  review: many(reviews),
  payments: many(payments),
}));

export const medicalRecordsRelations = relations(medicalRecords, ({ one, many }) => ({
  patient: one(users, { fields: [medicalRecords.patientId], references: [users.id] }),
  doctor: one(doctors, { fields: [medicalRecords.doctorId], references: [doctors.id] }),
  appointment: one(appointments, {
    fields: [medicalRecords.appointmentId],
    references: [appointments.id],
  }),
  hospital: one(hospitals, { fields: [medicalRecords.hospitalId], references: [hospitals.id] }),
  prescriptions: many(prescriptions),
}));

export const prescriptionsRelations = relations(prescriptions, ({ one, many }) => ({
  patient: one(users, { fields: [prescriptions.patientId], references: [users.id] }),
  doctor: one(doctors, { fields: [prescriptions.doctorId], references: [doctors.id] }),
  appointment: one(appointments, {
    fields: [prescriptions.appointmentId],
    references: [appointments.id],
  }),
  medicalRecord: one(medicalRecords, {
    fields: [prescriptions.medicalRecordId],
    references: [medicalRecords.id],
  }),
  hospital: one(hospitals, { fields: [prescriptions.hospitalId], references: [hospitals.id] }),
  items: many(prescriptionItems),
}));

export const prescriptionItemsRelations = relations(prescriptionItems, ({ one }) => ({
  prescription: one(prescriptions, {
    fields: [prescriptionItems.prescriptionId],
    references: [prescriptions.id],
  }),
}));

export const medicalDocumentsRelations = relations(medicalDocuments, ({ one }) => ({
  patient: one(users, { fields: [medicalDocuments.patientId], references: [users.id] }),
  doctor: one(doctors, { fields: [medicalDocuments.doctorId], references: [doctors.id] }),
  uploadedBy: one(users, {
    fields: [medicalDocuments.uploadedByUserId],
    references: [users.id],
  }),
  appointment: one(appointments, {
    fields: [medicalDocuments.appointmentId],
    references: [appointments.id],
  }),
  medicalRecord: one(medicalRecords, {
    fields: [medicalDocuments.medicalRecordId],
    references: [medicalRecords.id],
  }),
  hospital: one(hospitals, { fields: [medicalDocuments.hospitalId], references: [hospitals.id] }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  patient: one(users, { fields: [reviews.patientId], references: [users.id] }),
  doctor: one(doctors, { fields: [reviews.doctorId], references: [doctors.id] }),
  hospital: one(hospitals, { fields: [reviews.hospitalId], references: [hospitals.id] }),
  appointment: one(appointments, {
    fields: [reviews.appointmentId],
    references: [appointments.id],
  }),
}));

export const favoriteDoctorsRelations = relations(favoriteDoctors, ({ one }) => ({
  patient: one(users, { fields: [favoriteDoctors.patientId], references: [users.id] }),
  doctor: one(doctors, { fields: [favoriteDoctors.doctorId], references: [doctors.id] }),
}));

export const favoriteHospitalsRelations = relations(favoriteHospitals, ({ one }) => ({
  patient: one(users, { fields: [favoriteHospitals.patientId], references: [users.id] }),
  hospital: one(hospitals, { fields: [favoriteHospitals.hospitalId], references: [hospitals.id] }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  patient: one(users, { fields: [conversations.patientId], references: [users.id] }),
  doctor: one(doctors, { fields: [conversations.doctorId], references: [doctors.id] }),
  participants: many(conversationParticipants),
  messages: many(messages),
}));

export const conversationParticipantsRelations = relations(conversationParticipants, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationParticipants.conversationId],
    references: [conversations.id],
  }),
  user: one(users, { fields: [conversationParticipants.userId], references: [users.id] }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(users, { fields: [messages.senderId], references: [users.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  appointment: one(appointments, {
    fields: [payments.appointmentId],
    references: [appointments.id],
  }),
  invoice: one(invoices, { fields: [payments.invoiceId], references: [invoices.id] }),
  patient: one(users, { fields: [payments.patientId], references: [users.id] }),
  recordedBy: one(users, { fields: [payments.recordedByUserId], references: [users.id] }),
  refunds: many(refunds),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  patient: one(users, { fields: [invoices.patientId], references: [users.id] }),
  doctor: one(doctors, { fields: [invoices.doctorId], references: [doctors.id] }),
  hospital: one(hospitals, { fields: [invoices.hospitalId], references: [hospitals.id] }),
  appointment: one(appointments, {
    fields: [invoices.appointmentId],
    references: [appointments.id],
  }),
  payments: many(payments),
}));

export const refundsRelations = relations(refunds, ({ one }) => ({
  payment: one(payments, { fields: [refunds.paymentId], references: [payments.id] }),
  invoice: one(invoices, { fields: [refunds.invoiceId], references: [invoices.id] }),
  processedBy: one(users, { fields: [refunds.processedByUserId], references: [users.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, { fields: [auditLogs.actorUserId], references: [users.id] }),
}));

export const authSessionsRelations = relations(authSessions, ({ one }) => ({
  user: one(users, { fields: [authSessions.userId], references: [users.id] }),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, { fields: [passwordResetTokens.userId], references: [users.id] }),
}));

export const emailVerificationTokensRelations = relations(emailVerificationTokens, ({ one }) => ({
  user: one(users, { fields: [emailVerificationTokens.userId], references: [users.id] }),
}));

export const hospitalAdminsRelations = relations(hospitalAdmins, ({ one }) => ({
  user: one(users, { fields: [hospitalAdmins.userId], references: [users.id] }),
  hospital: one(hospitals, { fields: [hospitalAdmins.hospitalId], references: [hospitals.id] }),
}));

export const hospitalDepartmentsRelations = relations(hospitalDepartments, ({ one }) => ({
  hospital: one(hospitals, {
    fields: [hospitalDepartments.hospitalId],
    references: [hospitals.id],
  }),
}));

export const hospitalServicesRelations = relations(hospitalServices, ({ one }) => ({
  hospital: one(hospitals, { fields: [hospitalServices.hospitalId], references: [hospitals.id] }),
}));
