import { createServerFn } from "@tanstack/react-start";
import { isRedirect } from "@tanstack/react-router";
import { z } from "zod";

import { requireAnyRole, requireRole } from "@/lib/auth/authorization.server";
import { requireDoctorRecord } from "@/lib/doctor/queries.server";
import { idSchema } from "@/lib/validation/common";
import {
  conversationIdSchema,
  sendMessageSchema,
  startConversationSchema,
} from "@/lib/validation/messaging";

import {
  canUserSendMessages,
  isConversationDoctorSuspended,
  requireConversationParticipant,
} from "./authorization.server";
import { MessagingError } from "./errors";
import {
  getConversationDetail,
  getConversationMessages,
  listConversationsForDoctor,
  listConversationsForPatient,
  type ConversationListRow,
} from "./queries.server";
import { findOrCreateConversation, markConversationRead, sendMessage } from "./service.server";

/**
 * Same client-safe boundary pattern as every other `functions.ts` module.
 * Every handler resolves identity itself (`requireRole`, `requireDoctorRecord`,
 * `requireAnyRole`) — a conversation id is the only thing ever accepted
 * from the client for "which conversation", and every read/write
 * re-derives the caller's participancy from the session, never from
 * client-asserted role/identity.
 *
 * `requireDoctorRecord()` (not the verified-only variant) is used
 * throughout, deliberately: a doctor whose provider verification has been
 * SUSPENDED must still be able to read their message history (Phase 10
 * rule #21) — only NEW sends are blocked, and that's enforced inside
 * `sendMessage`/`isConversationDoctorSuspended`, not by locking the doctor
 * out of the whole messaging surface.
 */

interface ActionError {
  message: string;
}
type ActionResult<T extends object> = ({ ok: true } & T) | ({ ok: false } & ActionError);

function toActionError(error: unknown): ActionError {
  if (isRedirect(error)) throw error;
  if (error instanceof MessagingError) return { message: error.message };
  console.error("[messaging] unexpected error:", error);
  return { message: "Something went wrong. Please try again." };
}

function computeDisabledReason(doctorSuspended: boolean, senderCanSend: boolean): string | null {
  if (doctorSuspended) {
    return "This provider's account is currently suspended, so new messages can't be sent in this conversation.";
  }
  if (!senderCanSend) return "Your account can't send messages right now.";
  return null;
}

// --- Starting a conversation ---------------------------------------------------

export const startConversationAsPatientFn = createServerFn({ method: "POST" })
  .validator(startConversationSchema)
  .handler(async ({ data }): Promise<ActionResult<{ conversationId: string }>> => {
    try {
      const user = await requireRole("PATIENT");
      const conversation = await findOrCreateConversation(user.id, data.doctorId, user.id);
      return { ok: true, conversationId: conversation.id };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

export const startConversationAsDoctorFn = createServerFn({ method: "POST" })
  .validator(z.object({ patientId: idSchema }))
  .handler(async ({ data }): Promise<ActionResult<{ conversationId: string }>> => {
    try {
      const doctor = await requireDoctorRecord();
      const conversation = await findOrCreateConversation(data.patientId, doctor.id, doctor.userId);
      return { ok: true, conversationId: conversation.id };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });

// --- Conversation list -----------------------------------------------------------

/**
 * Works for whichever role is actually authenticated — a patient session
 * gets their doctor conversations, a doctor session gets their patient
 * conversations. There is no client input here at all beyond the session
 * cookie, so there's no "which list do you want" to spoof.
 */
export const listMyConversationsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<ConversationListRow[]> => {
    const user = await requireAnyRole(["PATIENT", "DOCTOR"]);
    try {
      if (user.role === "PATIENT") {
        return await listConversationsForPatient(user.id);
      }
      const doctor = await requireDoctorRecord();
      return await listConversationsForDoctor(doctor.id, doctor.userId);
    } catch (error) {
      console.error("[messaging] listMyConversationsFn failed:", error);
      return [];
    }
  },
);

// --- Conversation detail + messages -----------------------------------------------

export const getConversationFn = createServerFn({ method: "GET" })
  .validator(conversationIdSchema)
  .handler(async ({ data }) => {
    const user = await requireAnyRole(["PATIENT", "DOCTOR"]);
    try {
      const membership = await requireConversationParticipant(user.id, data.conversationId);
      if (!membership) return null;

      // Opening a conversation marks the other party's messages read
      // (Phase 10 rule #17). Best-effort: a failure here shouldn't stop
      // the conversation from displaying.
      await markConversationRead(user.id, data.conversationId).catch((error) => {
        console.error("[messaging] markConversationRead failed:", error);
      });

      const [detail, page, senderCanSend, doctorSuspended] = await Promise.all([
        getConversationDetail(data.conversationId),
        getConversationMessages(data.conversationId),
        canUserSendMessages(user.id),
        isConversationDoctorSuspended(membership.doctorId),
      ]);
      if (!detail) return null;

      const disabledReason = computeDisabledReason(doctorSuspended, senderCanSend);

      return { detail, ...page, viewerId: user.id, disabledReason };
    } catch (error) {
      console.error("[messaging] getConversationFn failed:", error);
      return null;
    }
  });

/**
 * Authoritative refresh of an OPEN conversation, used when a realtime hint
 * arrives (or on reconnect / tab re-focus). Same participant authorization
 * as every other messaging read: a non-participant gets `null`, exactly like
 * a nonexistent id, no matter what event they may have received.
 *
 * `markRead` is only ever true when the client reports the conversation is
 * actually visible. It can only mark the CALLER's OWN incoming messages read
 * (the same thing opening the conversation does), so the flag can't be used
 * to touch anyone else's state. Marking runs BEFORE the fetch and the
 * client serializes refreshes, so the returned rows reflect the read state
 * and there is no mark/fetch race; a message landing in between simply
 * triggers its own event and refresh.
 */
export const refreshConversationFn = createServerFn({ method: "POST" })
  .validator(z.object({ conversationId: idSchema, markRead: z.boolean().optional() }))
  .handler(async ({ data }) => {
    const user = await requireAnyRole(["PATIENT", "DOCTOR"]);
    try {
      const membership = await requireConversationParticipant(user.id, data.conversationId);
      if (!membership) return null;

      if (data.markRead) {
        await markConversationRead(user.id, data.conversationId).catch((error) => {
          console.error("[messaging] markConversationRead failed:", error);
        });
      }

      const [page, senderCanSend, doctorSuspended] = await Promise.all([
        getConversationMessages(data.conversationId),
        canUserSendMessages(user.id),
        isConversationDoctorSuspended(membership.doctorId),
      ]);
      return { ...page, disabledReason: computeDisabledReason(doctorSuspended, senderCanSend) };
    } catch (error) {
      console.error("[messaging] refreshConversationFn failed:", error);
      return null;
    }
  });

export const loadOlderMessagesFn = createServerFn({ method: "GET" })
  .validator(z.object({ conversationId: idSchema, before: z.string().datetime() }))
  .handler(async ({ data }) => {
    const user = await requireAnyRole(["PATIENT", "DOCTOR"]);
    const membership = await requireConversationParticipant(user.id, data.conversationId);
    if (!membership) return { messages: [], hasMore: false };
    return getConversationMessages(data.conversationId, { before: new Date(data.before) });
  });

export const sendMessageFn = createServerFn({ method: "POST" })
  .validator(sendMessageSchema)
  .handler(async ({ data }): Promise<ActionResult<{ messageId: string }>> => {
    try {
      const user = await requireAnyRole(["PATIENT", "DOCTOR"]);
      const message = await sendMessage(user.id, data.conversationId, data.body);
      return { ok: true, messageId: message.id };
    } catch (error) {
      return { ok: false, ...toActionError(error) };
    }
  });
