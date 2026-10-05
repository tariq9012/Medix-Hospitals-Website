import "dotenv/config";

import { defineConfig } from "drizzle-kit";

// `drizzle-kit generate` only diffs the schema against the migrations folder
// and doesn't need a live database, so a placeholder keeps that command
// working before a real DATABASE_URL is configured. `migrate`/`studio` do
// need a real, reachable PostgreSQL connection string in `.env`.
const connectionString =
  process.env["DATABASE_URL"] ?? "postgres://placeholder:placeholder@localhost:5432/placeholder";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: connectionString,
  },
  strict: true,
  verbose: true,
});
