/**
 * A JSON-safe value type for `jsonb` columns.
 *
 * Typing these as `Record<string, unknown>` compiles at the Drizzle level
 * but fails TanStack Start's server-function serialization check, because
 * `unknown` can't be proven serializable. Constraining the values to actual
 * JSON primitives/structures makes the audit-log and notification metadata
 * safely returnable from a server function.
 */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };
