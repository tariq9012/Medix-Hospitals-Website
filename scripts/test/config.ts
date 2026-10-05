/**
 * Central test configuration — the ONLY place test tooling reads its
 * environment. Everything is derived at runtime: no absolute paths, no
 * machine-specific locations, no credentials committed to the repo.
 *
 * Resolution order for every TEST_* value: real environment variable →
 * `.env.test` (git-ignored, optional) → a safe default (only where one is
 * safe; the database URL deliberately has none).
 *
 * Tests NEVER read `DATABASE_URL`. That variable belongs to the application /
 * your development database; tests use `TEST_DATABASE_URL` exclusively and
 * refuse to run unless the target is a disposable database created by
 * `npm run test:db:setup` (see ./db-guard.ts).
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "dotenv";

/** Repository root, derived from this file's location (works from any checkout path, incl. Windows). */
export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Scratch directory for test-run artifacts (git-ignored): fixtures file, uploads, screenshots, logs. */
export const RUN_DIR = path.join(PROJECT_ROOT, ".test-run");

function readEnvFile(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  return parse(readFileSync(file));
}

let envFileLoaded = false;
/** Loads `.env.test` into process.env without overriding anything already set. Never reads `.env`. */
export function loadTestEnvFile(): void {
  if (envFileLoaded) return;
  envFileLoaded = true;
  for (const [key, value] of Object.entries(readEnvFile(path.join(PROJECT_ROOT, ".env.test")))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/**
 * The developer/application database URL, if any, read ONLY so the guard can
 * refuse to run tests against it. (Real env wins over `.env`, as in the app.)
 */
export function getApplicationDatabaseUrl(): string | undefined {
  return (
    process.env["DATABASE_URL"] ?? readEnvFile(path.join(PROJECT_ROOT, ".env"))["DATABASE_URL"]
  );
}

export interface TestConfig {
  projectRoot: string;
  runDir: string;
  /** Required for anything that touches a database. Undefined only when no DB-backed tooling is used. */
  databaseUrl: string | undefined;
  baseUrl: string;
  port: number;
  password: string;
  sessionSecret: string;
  allowRemoteDb: boolean;
  emails: {
    patient: string;
    doctor: string;
    patientB: string;
    doctorB: string;
    hospitalAdmin: string;
    admin: string;
  };
  fixturesFile: string;
  uploadDir: string;
}

const DEFAULT_PASSWORD = "MedixDev#2026"; // the documented DEV-ONLY seed password (see src/db/seed.ts)

export function getTestConfig(): TestConfig {
  loadTestEnvFile();
  const env = process.env;

  const baseUrl = (env["TEST_BASE_URL"] ?? "http://127.0.0.1:4173").replace(/\/+$/, "");
  const port = Number(new URL(baseUrl).port || (baseUrl.startsWith("https") ? 443 : 80));

  // One secret per test process tree: generated once, then inherited by children via env.
  if (!env["TEST_SESSION_SECRET"])
    env["TEST_SESSION_SECRET"] = randomBytes(36).toString("base64url");

  return {
    projectRoot: PROJECT_ROOT,
    runDir: RUN_DIR,
    databaseUrl: env["TEST_DATABASE_URL"] || undefined,
    baseUrl,
    port,
    password: env["TEST_PASSWORD"] ?? DEFAULT_PASSWORD,
    sessionSecret: env["TEST_SESSION_SECRET"]!,
    allowRemoteDb: env["TEST_ALLOW_REMOTE_DB"] === "1",
    emails: {
      patient: env["TEST_PATIENT_EMAIL"] ?? "tariq.khan@example.com",
      doctor: env["TEST_DOCTOR_EMAIL"] ?? "dr.ahmed.raza@medix.example",
      patientB: env["TEST_PATIENT_B_EMAIL"] ?? "patient.b@example.com",
      doctorB: env["TEST_DOCTOR_B_EMAIL"] ?? "dr.sara.khan@medix.example",
      hospitalAdmin: env["TEST_HOSPITAL_ADMIN_EMAIL"] ?? "admin@medixcentral.example",
      admin: env["TEST_ADMIN_EMAIL"] ?? "platform.admin@medix.example",
    },
    fixturesFile: env["TEST_FIXTURES_FILE"] ?? path.join(RUN_DIR, "fixtures.json"),
    uploadDir: env["TEST_UPLOAD_DIR"] ?? path.join(RUN_DIR, "uploads"),
  };
}

/** Throws a helpful error when TEST_DATABASE_URL is missing. */
export function requireTestDatabaseUrl(cfg: TestConfig = getTestConfig()): string {
  if (!cfg.databaseUrl) {
    throw new Error(
      [
        "TEST_DATABASE_URL is not set.",
        "",
        "Tests never use DATABASE_URL (your development database). Point TEST_DATABASE_URL at a",
        'DISPOSABLE database whose name contains "test", e.g.:',
        "",
        "  postgres://USER:PASSWORD@localhost:5432/medix_test",
        "",
        "Put it in .env.test (copy .env.test.example) or export it, then run:",
        "  npm run test:db:setup",
      ].join("\n"),
    );
  }
  return cfg.databaseUrl;
}
