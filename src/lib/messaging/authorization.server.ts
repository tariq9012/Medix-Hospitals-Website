import "@tanstack/react-start/server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { appointments, conversationParticipants, conversations, doctors, users } from "@/db/schema";

import { MessagingError } from "./errors";

/**
 * The single centralized messaging-eligibility rule (Phase 10 policy):
 * a patient and doctor may message each other only if they have at least
 * one appointment relationship that isn't purely a no-show/cancellation.
 * Every conversation-creation path MUST go through this — there is no
 * other place in the codebase allowed to grant messaging eligibility.
 *
 * PENDING/CONFIRMED/COMPLETED all count. A CANCELLED or NO_SHOW
 * appointment alone does not, but doesn't need special-casing here: if
 * that's the only appointment between them, this simply finds nothing and
 * the caller reports "no relationship" — cancelling one appointment can't
 * retroactively revoke eligibility earned by another real one.
 */
const ELIGIBLE_STATUSES = ["PENDING", "CONFIRMED", "COMPLETED"] as const;

export async function hasEligiblePatientDoctorRelationship(
  patientId: string,
  doctorId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(
      and(
        eq(appointments.patientId, patientId),
        eq(appointments.doctorId, doctorId),
        inArray(appointments.status, ELIGIBLE_STATUSES),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export interface ConversationParty {
  patientId: string;
  doctorId: string;
  doctorUserId: string;
}

/**
 * Resolves and validates a patient/doctor pair before a conversation may be
 * created or used. Throws a safe, user-facing `MessagingError` if either
 * side doesn't exist or there's no eligible relationship — never leaks
 * which specific condition failed beyond that.
 */
export async function requireEligiblePatientDoctorPair(
  patientId: string,
  doctorId: string,
): Promise<ConversationParty> {
  const [doctor] = await db
    .select({ id: doctors.id, userId: doctors.userId })
    .from(doctors)
    .where(eq(doctors.id, doctorId))
    .limit(1);
  if (!doctor) {
    throw new MessagingError("This doctor could not be found.");
  }

  const eligible = await hasEligiblePatientDoctorRelationship(patientId, doctorId);
  if (!eligible) {
    throw new MessagingError("You can only message a doctor you have an appointment with.");
  }

  return { patientId, doctorId, doctorUserId: doctor.userId };
}

/**
 * The single centralized "is this user allowed to see/use this
 * conversation" check. Every conversation read or write MUST call this —
 * a user who isn't a participant gets treated exactly like a nonexistent
 * conversation id (same `null` result), so nothing about the
 * conversation's existence leaks to someone probing an id that isn't
 * theirs.
 */
export async function requireConversationParticipant(
  userId: string,
  conversationId: string,
): Promise<{ conversationId: string; patientId: string; doctorId: string } | null> {
  const [row] = await db
    .select({
      conversationId: conversations.id,
      patientId: conversations.patientId,
      doctorId: conversations.doctorId,
    })
    .from(conversationParticipants)
    .innerJoin(conversations, eq(conversations.id, conversationParticipants.conversationId))
    .where(
      and(
        eq(conversationParticipants.userId, userId),
        eq(conversationParticipants.conversationId, conversationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * True once a user's account is active enough to send new messages.
 * Historical messages remain visible regardless — this only gates new
 * sends (Phase 10 rule #21).
 */
export async function canUserSendMessages(userId: string): Promise<boolean> {
  const [user] = await db
    .select({ status: users.status })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user || user.status !== "ACTIVE") return false;
  const [doctor] = await db
    .select({ verificationStatus: doctors.verificationStatus })
    .from(doctors)
    .where(eq(doctors.userId, userId))
    .limit(1);
  // Not a doctor at all -> only the account-status check above applies.
  if (!doctor) return true;
  // A doctor whose provider verification has been suspended can't send new
  // messages, even though their user account may still be ACTIVE.
  return doctor.verificationStatus !== "SUSPENDED";
}

/**
 * True once the doctor side of a conversation has been operationally
 * suspended. When true, NEITHER party may send new messages in that
 * conversation — a patient can't message a provider who's been suspended,
 * and the suspended doctor can't message out either. Historical messages
 * remain fully readable; this only blocks new sends.
 */
export async function isConversationDoctorSuspended(doctorId: string): Promise<boolean> {
  const [doctor] = await db
    .select({ verificationStatus: doctors.verificationStatus })
    .from(doctors)
    .where(eq(doctors.id, doctorId))
    .limit(1);
  return doctor?.verificationStatus === "SUSPENDED";
}
