import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import type { JsonObject } from "./json";
import { users } from "./users";

/**
 * Append-only log of sensitive/accountable actions across the platform:
 * medical-record access/changes, prescription creation, appointment status
 * changes, doctor/hospital verification decisions, and (later) login events.
 *
 * Never write plaintext passwords, tokens, or other secrets into `metadata`.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Nullable so the log entry survives even if the actor's account is later removed. */
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    /** e.g. "MEDICAL_RECORD_CREATED", "APPOINTMENT_STATUS_CHANGED", "DOCTOR_VERIFIED". */
    action: varchar("action", { length: 150 }).notNull(),
    /** e.g. "medical_record", "appointment", "doctor". */
    entityType: varchar("entity_type", { length: 100 }).notNull(),
    entityId: uuid("entity_id"),
    metadata: jsonb("metadata").$type<JsonObject>(),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
    index("audit_logs_actor_idx").on(table.actorUserId),
    // The admin activity-log viewer pages newest-first over this column.
    index("audit_logs_created_idx").on(table.createdAt),
  ],
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
