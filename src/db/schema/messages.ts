import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { doctors } from "./doctors";
import { users } from "./users";

/**
 * Secure messaging foundation for patient <-> doctor conversations. This is
 * a data model only — no real-time delivery (WebSockets/push) is wired up
 * in this phase; see `src/lib/messaging/` for the authorization and
 * business logic that sits in front of these tables.
 *
 * `patientId`/`doctorId` are denormalized directly onto `conversations`
 * (in addition to `conversation_participants` below) specifically so one
 * active conversation per patient/doctor pair can be enforced with a real
 * database unique index — not just a "check then insert" in application
 * code, which can race under concurrent requests. Every authorization
 * check still goes through `conversation_participants`, per Phase 10's
 * policy; these columns exist for uniqueness and efficient list queries,
 * not as a shortcut around that.
 */
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    doctorId: uuid("doctor_id")
      .notNull()
      .references(() => doctors.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One active conversation per patient/doctor pair, enforced at the
    // database level.
    uniqueIndex("conversations_patient_doctor_unique").on(table.patientId, table.doctorId),
    index("conversations_doctor_idx").on(table.doctorId),
  ],
);

export const conversationParticipants = pgTable(
  "conversation_participants",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.userId] }),
    // The primary key covers (conversationId, userId) lookups, but a
    // "find every conversation this user belongs to" query needs userId
    // leading its own index.
    index("conversation_participants_user_idx").on(table.userId),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    /** Nullable so a message's history survives if the sender's account is removed. */
    senderId: uuid("sender_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("messages_conversation_created_idx").on(table.conversationId, table.createdAt),
    index("messages_conversation_read_idx").on(table.conversationId, table.readAt),
  ],
);

export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
