// Enforced server-only boundary: TanStack Start's import-protection plugin
// flags this module if anything in the client bundle ever tries to import
// it, so database credentials/queries can never leak into browser code.
import "@tanstack/react-start/server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const connectionString = process.env["DATABASE_URL"];

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env and configure a PostgreSQL connection string.",
  );
}

// A single shared connection pool for the server process. Tune `max` to your
// deployment target (lower for serverless/edge, higher for a long-lived
// Node server with more concurrent request volume).
const client = postgres(connectionString, { max: 10 });

export { client };
export const db = drizzle(client, { schema });

export type Database = typeof db;
