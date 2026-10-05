import "@tanstack/react-start/server-only";

import { and, desc, eq, lt, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  appointments,
  conversations,
  doctors,
  messages,
  patientProfiles,
  type Message,
} from "@/db/schema";

export interface ConversationListRow {
  id: string;
  patientId: string;
  doctorId: string;
  otherPartyFirstName: string;
  otherPartyLastName: string;
  lastMessageBody: string | null;
  lastMessageAt: Date | null;
  unreadCount: number;
  createdAt: Date;
}

/**
 * Both list queries below use scalar subqueries (evaluated by Postgres
 * once per row via the indexes on `messages(conversation_id, created_at)`
 * and `messages(conversation_id, read_at)`) rather than one round trip per
 * conversation — a handful of conversations or a hundred, it's the same
 * single query (Phase 10 rule #13: avoid N+1).
 */

const lastMessageBody = sql<string | null>`(
  select ${messages.body} from ${messages}
  where ${messages.conversationId} = ${conversations.id}
  order by ${messages.createdAt} desc
  limit 1
)`;

const lastMessageAt = sql<Date | null>`(
  select ${messages.createdAt} from ${messages}
  where ${messages.conversationId} = ${conversations.id}
  order by ${messages.createdAt} desc
  limit 1
)`;

function unreadCountExcludingSender(meId: string) {
  return sql<number>`(
    select count(*)::int from ${messages}
    where ${messages.conversationId} = ${conversations.id}
      and ${messages.readAt} is null
      and (${messages.senderId} is null or ${messages.senderId} != ${meId})
  )`;
}

/** Every conversation belonging to this patient, most recently active first. */
export async function listConversationsForPatient(
  patientId: string,
): Promise<ConversationListRow[]> {
  const rows = await db
    .select({
      id: conversations.id,
      patientId: conversations.patientId,
      doctorId: conversations.doctorId,
      otherPartyFirstName: doctors.firstName,
      otherPartyLastName: doctors.lastName,
      lastMessageBody,
      lastMessageAt,
      unreadCount: unreadCountExcludingSender(patientId),
      createdAt: conversations.createdAt,
    })
    .from(conversations)
    .innerJoin(doctors, eq(doctors.id, conversations.doctorId))
    .where(eq(conversations.patientId, patientId))
    .orderBy(desc(sql`coalesce(${lastMessageAt}, ${conversations.createdAt})`));
  return rows;
}

/** Every conversation belonging to this doctor, most recently active first. */
export async function listConversationsForDoctor(
  doctorId: string,
  doctorUserId: string,
): Promise<ConversationListRow[]> {
  const rows = await db
    .select({
      id: conversations.id,
      patientId: conversations.patientId,
      doctorId: conversations.doctorId,
      otherPartyFirstName: patientProfiles.firstName,
      otherPartyLastName: patientProfiles.lastName,
      lastMessageBody,
      lastMessageAt,
      // `messages.senderId` is always a users.id, never a doctors.id — the
      // doctor's OWN user id must be used here, not their doctor-profile
      // id, or every message (including the doctor's own sends) would be
      // miscounted as unread.
      unreadCount: unreadCountExcludingSender(doctorUserId),
      createdAt: conversations.createdAt,
    })
    .from(conversations)
    .leftJoin(patientProfiles, eq(patientProfiles.userId, conversations.patientId))
    .where(eq(conversations.doctorId, doctorId))
    .orderBy(desc(sql`coalesce(${lastMessageAt}, ${conversations.createdAt})`));
  return rows.map((r) => ({
    ...r,
    otherPartyFirstName: r.otherPartyFirstName ?? "Unknown",
    otherPartyLastName: r.otherPartyLastName ?? "Patient",
  }));
}

export interface ConversationDetail {
  id: string;
  patientId: string;
  doctorId: string;
  doctorFirstName: string;
  doctorLastName: string;
  patientFirstName: string;
  patientLastName: string;
  latestAppointmentStatus: string | null;
  latestAppointmentDate: string | null;
}

/**
 * Conversation metadata plus lightweight relationship context (the most
 * recent appointment's status/date) — useful for the doctor-side header
 * ("Confirmed appointment on ...") without exposing any clinical content.
 * Does NOT enforce authorization itself; callers must have already
 * confirmed participancy via `requireConversationParticipant`.
 */
export async function getConversationDetail(
  conversationId: string,
): Promise<ConversationDetail | null> {
  const [row] = await db
    .select({
      id: conversations.id,
      patientId: conversations.patientId,
      doctorId: conversations.doctorId,
      doctorFirstName: doctors.firstName,
      doctorLastName: doctors.lastName,
      patientFirstName: patientProfiles.firstName,
      patientLastName: patientProfiles.lastName,
    })
    .from(conversations)
    .innerJoin(doctors, eq(doctors.id, conversations.doctorId))
    .leftJoin(patientProfiles, eq(patientProfiles.userId, conversations.patientId))
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!row) return null;

  const [latestAppointment] = await db
    .select({ status: appointments.status, appointmentDate: appointments.appointmentDate })
    .from(appointments)
    .where(and(eq(appointments.patientId, row.patientId), eq(appointments.doctorId, row.doctorId)))
    .orderBy(desc(appointments.appointmentDate), desc(appointments.startTime))
    .limit(1);

  return {
    ...row,
    patientFirstName: row.patientFirstName ?? "Unknown",
    patientLastName: row.patientLastName ?? "Patient",
    latestAppointmentStatus: latestAppointment?.status ?? null,
    latestAppointmentDate: latestAppointment?.appointmentDate ?? null,
  };
}

export interface MessagePage {
  messages: Message[];
  hasMore: boolean;
}

/**
 * Chronologically ordered messages for a conversation, most recent page
 * first (then reversed to display oldest-to-newest), with cursor-based
 * pagination on `createdAt` — never an unbounded lifetime history load.
 */
export async function getConversationMessages(
  conversationId: string,
  options: { before?: Date; limit?: number } = {},
): Promise<MessagePage> {
  const limit = options.limit ?? 50;
  const rows = await db
    .select()
    .from(messages)
    .where(
      options.before
        ? and(eq(messages.conversationId, conversationId), lt(messages.createdAt, options.before))
        : eq(messages.conversationId, conversationId),
    )
    .orderBy(desc(messages.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse();
  return { messages: page, hasMore };
}

/** How many of a conversation's messages are unread by `meId` (the other party's messages). */
export async function countUnreadInConversation(
  conversationId: string,
  meId: string,
): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        sql`${messages.readAt} is null and (${messages.senderId} is null or ${messages.senderId} != ${meId})`,
      ),
    );
  return row?.value ?? 0;
}
