import "@tanstack/react-start/server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  conversationParticipants,
  conversations,
  doctors,
  messages,
  patientProfiles,
  type Conversation,
  type Message,
} from "@/db/schema";
import { recordAuthAuditEvent } from "@/lib/auth/audit.server";
import { createNotification } from "@/lib/notifications/service.server";
import { publishConversationRead, publishMessageCreated } from "@/lib/realtime/events.server";

import {
  canUserSendMessages,
  isConversationDoctorSuspended,
  requireConversationParticipant,
  requireEligiblePatientDoctorPair,
} from "./authorization.server";
import { MessagingError } from "./errors";

/** Postgres unique-violation error code. */
const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === UNIQUE_VIOLATION) return true;
  if ("cause" in error && error.cause && typeof error.cause === "object" && "code" in error.cause) {
    return error.cause.code === UNIQUE_VIOLATION;
  }
  return false;
}

/**
 * Finds the existing conversation for this patient/doctor pair, or creates
 * one — but only after confirming a real, eligible appointment
 * relationship exists (never trusting either side's identity from the
 * client beyond "which doctor did the patient pick").
 *
 * One conversation per pair is enforced by a real database unique index
 * (`conversations_patient_doctor_unique`), not just a "check then insert"
 * — two concurrent requests for the same pair both pass the eligibility
 * check and both attempt the INSERT; Postgres allows exactly one to
 * succeed, and the loser's unique-violation is caught here and turned into
 * a lookup of the row the winner just created, so both callers end up
 * with the same conversation id.
 */
export async function findOrCreateConversation(
  patientUserId: string,
  doctorId: string,
  actorUserId: string,
): Promise<Conversation> {
  const party = await requireEligiblePatientDoctorPair(patientUserId, doctorId);

  const [existing] = await db
    .select()
    .from(conversations)
    .where(
      and(eq(conversations.patientId, party.patientId), eq(conversations.doctorId, party.doctorId)),
    )
    .limit(1);
  if (existing) return existing;

  try {
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(conversations)
        .values({ patientId: party.patientId, doctorId: party.doctorId })
        .returning();
      if (!row) {
        throw new MessagingError("Could not start the conversation. Please try again.");
      }

      await tx.insert(conversationParticipants).values([
        { conversationId: row.id, userId: party.patientId },
        { conversationId: row.id, userId: party.doctorUserId },
      ]);

      return row;
    });

    await recordAuthAuditEvent({
      actorUserId,
      action: "CONVERSATION_CREATED",
      entityType: "conversation",
      entityId: created.id,
    });

    return created;
  } catch (error) {
    if (isUniqueViolation(error)) {
      const [winner] = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.patientId, party.patientId),
            eq(conversations.doctorId, party.doctorId),
          ),
        )
        .limit(1);
      if (winner) return winner;
    }
    throw error;
  }
} /**
 * Sends a message. Sender identity is always the authenticated session
 * user, never client input. Every gate runs before the write:
 *  - the sender must actually be a participant of this conversation
 *    (never fetched globally and filtered client-side);
 *  - the sender's own account must be ACTIVE (and, if they're a doctor,
 *    not SUSPENDED);
 *  - the conversation's doctor side must not be operationally suspended —
 *    this blocks new sends from BOTH parties without touching message
 *    history.
 *
 * The message insert and its NEW_MESSAGE notification to the other party
 * happen back-to-back; a notification failure is swallowed inside
 * `createNotification` itself (logged, not thrown) so it can never cause
 * a message to appear "sent" and then roll back, and a retry after a
 * notification hiccup can never create a duplicate message (the message
 * row is already committed by the time the notification is attempted).
 */
export async function sendMessage(
  senderUserId: string,
  conversationId: string,
  body: string,
): Promise<Message> {
  const membership = await requireConversationParticipant(senderUserId, conversationId);
  if (!membership) {
    // Same error whether the conversation doesn't exist or the caller
    // just isn't part of it — never confirm which to an unauthorized caller.
    throw new MessagingError("Conversation not found.");
  }

  const [senderCanSend, doctorSuspended] = await Promise.all([
    canUserSendMessages(senderUserId),
    isConversationDoctorSuspended(membership.doctorId),
  ]);
  if (!senderCanSend) {
    throw new MessagingError("Your account can't send messages right now.");
  }
  if (doctorSuspended) {
    throw new MessagingError(
      "This provider's account is currently suspended, so new messages can't be sent in this conversation.",
    );
  }

  // Message row + conversation touch commit together, so a realtime event
  // (published only after this resolves) can never describe uncommitted data.
  const created = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(messages)
      .values({ conversationId, senderId: senderUserId, body })
      .returning();
    if (!row) {
      throw new MessagingError("Could not send the message. Please try again.");
    }
    await tx
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));
    return row;
  });

  const recipientUserId =
    senderUserId === membership.patientId
      ? await getDoctorUserId(membership.doctorId)
      : membership.patientId;

  // Post-commit, best-effort realtime hint. Both participants' streams are
  // told (the sender's other tabs need it too); ids are derived from the
  // database, and the payload carries no message text.
  publishMessageCreated({
    participantUserIds: [senderUserId, ...(recipientUserId ? [recipientUserId] : [])],
    conversationId,
    messageId: created.id,
  });

  await recordAuthAuditEvent({
    actorUserId: senderUserId,
    action: "MESSAGE_SENT",
    entityType: "message",
    entityId: created.id,
    metadata: { conversationId },
  });

  if (recipientUserId) {
    const senderLabel = await getSenderDisplayLabel(senderUserId, membership);
    await createNotification({
      userId: recipientUserId,
      type: "NEW_MESSAGE",
      title: "New message",
      // Deliberately generic — never the message body itself (Phase 10
      // rule #25/#38: notifications must not expose conversation content).
      message: `You have a new message from ${senderLabel}.`,
      metadata: { conversationId },
    });
  }

  return created;
}

async function getDoctorUserId(doctorId: string): Promise<string | null> {
  const [row] = await db
    .select({ userId: doctors.userId })
    .from(doctors)
    .where(eq(doctors.id, doctorId))
    .limit(1);
  return row?.userId ?? null;
}

async function getSenderDisplayLabel(
  senderUserId: string,
  membership: { patientId: string; doctorId: string },
): Promise<string> {
  if (senderUserId === membership.patientId) {
    const [profile] = await db
      .select({ firstName: patientProfiles.firstName, lastName: patientProfiles.lastName })
      .from(patientProfiles)
      .where(eq(patientProfiles.userId, senderUserId))
      .limit(1);
    return profile ? `${profile.firstName} ${profile.lastName}` : "your patient";
  }
  const [doctor] = await db
    .select({ firstName: doctors.firstName, lastName: doctors.lastName })
    .from(doctors)
    .where(eq(doctors.id, membership.doctorId))
    .limit(1);
  return doctor ? `Dr. ${doctor.firstName} ${doctor.lastName}` : "your doctor";
}

/**
 * Marks every incoming (not-sent-by-me) unread message in this
 * conversation as read. A participant can only ever mark their OWN
 * incoming messages read — there's no path here for a sender to fake a
 * read receipt for the other party, and no path for one participant to
 * touch another's read state on a different conversation.
 */
export async function markConversationRead(
  userId: string,
  conversationId: string,
): Promise<number> {
  const membership = await requireConversationParticipant(userId, conversationId);
  if (!membership) {
    throw new MessagingError("Conversation not found.");
  }

  const updated = await db
    .update(messages)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(messages.conversationId, conversationId),
        isNull(messages.readAt),
        sql`(${messages.senderId} is null or ${messages.senderId} != ${userId})`,
      ),
    )
    .returning({ id: messages.id });

  // Committed: let this user's OTHER tabs refresh their unread state. Nothing
  // is sent to the other party — no read receipts are exposed.
  if (updated.length > 0) publishConversationRead(userId, conversationId);

  return updated.length;
}
