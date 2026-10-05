/**
 * One command for the browser E2E suite:   npm run test:e2e
 *
 *   guard → fresh disposable DB (+ fixtures) → build → start the app → wait until ready →
 *   run each Python/Playwright script against a pristine database → ALWAYS stop the app.
 *
 * Flags:
 *   --only e1,e8        run only scripts whose file name starts with one of these prefixes
 *   --skip-build        reuse the existing dist/ (otherwise `vite build` runs first)
 *   --shared            do NOT restore a pristine DB between scripts (faster, order-dependent)
 *
 * Safety: tests only ever use TEST_DATABASE_URL, behind the fail-closed guard (name contains "test",
 * not the dev DB, local host, created by `test:db:setup`). The runner refuses to start if the target
 * port is already serving something (it would otherwise talk to a server wired to a DIFFERENT
 * database). The app it starts is pointed at the test database explicitly.
 *
 * Requirements (see README → Testing → E2E): Python 3 with `pip install -r tests/e2e/requirements.txt`
 * and `python -m playwright install chromium`.
 */
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  createWriteStream,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  type WriteStream,
} from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";

import postgres from "postgres";

import {
  getApplicationDatabaseUrl,
  getTestConfig,
  PROJECT_ROOT,
  requireTestDatabaseUrl,
} from "./config";
import { assertSafeTestDatabase, parseDatabaseUrl } from "./db-guard";
import { setupTestDatabase } from "./db-setup";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const cfg = getTestConfig();
const E2E_DIR = path.join(PROJECT_ROOT, "tests", "e2e");
const LOG_FILE = path.join(cfg.runDir, "server.log");
const quoteIdent = (n: string) => `"${n.replace(/"/g, '""')}"`;

let server: ChildProcess | undefined;
let logStream: WriteStream | undefined;
let ctl: http.Server | undefined;
let templateName: string | undefined;
/** Extra server env for the current script (declared in its `# E2E-SERVER-ENV: K=V ...` header). */
let serverExtraEnv: Record<string, string> = {};
let shuttingDown = false;

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────
function findPython(): string {
  const candidates = [process.env["TEST_PYTHON"], "python3", "python", "py"].filter(
    (c): c is string => Boolean(c),
  );
  for (const bin of candidates) {
    const r = spawnSync(bin, ["-c", "import playwright, psycopg; print('ok')"], {
      encoding: "utf8",
    });
    if (r.status === 0 && r.stdout.includes("ok")) return bin;
  }
  const probe = candidates.find(
    (bin) => spawnSync(bin, ["--version"], { encoding: "utf8" }).status === 0,
  );
  throw new Error(
    probe
      ? `Python found ("${probe}") but the E2E dependencies are missing. Run:\n` +
          `  ${probe} -m pip install -r tests/e2e/requirements.txt\n` +
          `  ${probe} -m playwright install chromium`
      : "Python 3 was not found. Install it (and set TEST_PYTHON if it is not on PATH), then run:\n" +
          "  python -m pip install -r tests/e2e/requirements.txt\n  python -m playwright install chromium",
  );
}

function runScript(
  python: string,
  script: string,
  env: NodeJS.ProcessEnv,
): Promise<{ code: number | null; text: string }> {
  return new Promise((resolve) => {
    const child = spawn(python, ["-u", script], { cwd: E2E_DIR, env });
    let text = "";
    const onData = (d: Buffer) => {
      const chunk = d.toString();
      text += chunk;
      process.stdout.write(chunk);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    const timer = setTimeout(() => {
      text += `\n[runner] ${script} exceeded 15 minutes — killed\n`;
      child.kill("SIGKILL");
    }, 15 * 60_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, text });
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: 1, text: `${text}\n[runner] failed to start ${python}: ${e.message}\n` });
    });
  });
}

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: "127.0.0.1" });
    s.once("connect", () => {
      s.destroy();
      resolve(true);
    });
    s.once("error", () => resolve(false));
  });
}

async function waitReady(timeoutMs: number): Promise<void> {
  const end = Date.now() + timeoutMs;
  let last = "no response";
  while (Date.now() < end) {
    if (server && server.exitCode !== null)
      throw new Error(`server exited early (code ${server.exitCode}); see ${LOG_FILE}`);
    try {
      const r = await fetch(`${cfg.baseUrl}/api/ready`);
      if (r.ok) return;
      last = `HTTP ${r.status}`;
    } catch (e) {
      last = (e as Error).message;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`app not ready after ${timeoutMs / 1000}s (${last}); see ${LOG_FILE}`);
}

/** Reads `# E2E-SERVER-ENV: KEY=VALUE KEY2=VALUE2` from the first lines of a script. */
function readServerEnv(file: string): Record<string, string> {
  const head = readFileSync(path.join(E2E_DIR, file), "utf8").split(/\r?\n/).slice(0, 15);
  const line = head.find((l) => /^#\s*E2E-SERVER-ENV:/.test(l));
  const out: Record<string, string> = {};
  const body = line?.replace(/^#\s*E2E-SERVER-ENV:\s*/, "") ?? "";
  for (const pair of body.split(/\s+/).filter(Boolean)) {
    const [k, ...v] = pair.split("=");
    if (k && /^[A-Z][A-Z0-9_]*$/.test(k)) out[k] = v.join("=");
  }
  return out;
}

function startServer(dbUrl: string): Promise<void> {
  const vite = path.join(PROJECT_ROOT, "node_modules", "vite", "bin", "vite.js");
  server = spawn(
    process.execPath,
    [vite, "preview", "--port", String(cfg.port), "--host", "127.0.0.1", "--strictPort"],
    {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        DATABASE_URL: dbUrl,
        SESSION_SECRET: cfg.sessionSecret,
        APP_URL: cfg.baseUrl,
        MEDICAL_UPLOAD_DIR: cfg.uploadDir,
        ...serverExtraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout?.pipe(logStream!, { end: false });
  server.stderr?.pipe(logStream!, { end: false });
  return waitReady(90_000);
}

function stopServer(): Promise<void> {
  const proc = server;
  server = undefined;
  if (!proc || proc.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    proc.once("exit", () => resolve());
    if (process.platform === "win32" && proc.pid) {
      spawnSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"]);
    } else {
      proc.kill("SIGTERM");
      setTimeout(() => proc.kill("SIGKILL"), 5000).unref();
    }
    setTimeout(resolve, 8000).unref();
  });
}

async function adminSql<T>(testUrl: string, fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const u = new URL(testUrl);
  u.pathname = "/postgres";
  const sql = postgres(u.toString(), { max: 1, onnotice: () => {}, connect_timeout: 10 });
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** Snapshot the freshly set-up DB as a template so each script can start from pristine data in ~1s. */
async function createTemplate(testUrl: string, dbName: string): Promise<string> {
  const tpl = `${dbName}_tpl`;
  await adminSql(testUrl, async (sql) => {
    await sql.unsafe(`drop database if exists ${quoteIdent(tpl)} with (force)`);
    await sql.unsafe(`create database ${quoteIdent(tpl)} template ${quoteIdent(dbName)}`);
  });
  return tpl;
}

async function restoreFromTemplate(testUrl: string, dbName: string, tpl: string): Promise<void> {
  await adminSql(testUrl, async (sql) => {
    await sql.unsafe(`drop database if exists ${quoteIdent(dbName)} with (force)`);
    await sql.unsafe(`create database ${quoteIdent(dbName)} template ${quoteIdent(tpl)}`);
  });
}

async function cleanup(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  await stopServer();
  ctl?.close();
  logStream?.end();
  const url = cfg.databaseUrl;
  if (templateName && url) {
    await adminSql(url, (sql) =>
      sql.unsafe(`drop database if exists ${quoteIdent(templateName!)} with (force)`),
    ).catch(() => undefined);
  }
}

// ── main ────────────────────────────────────────────────────────────────────────────────────────
async function main(): Promise<number> {
  mkdirSync(cfg.runDir, { recursive: true });
  const testUrl = requireTestDatabaseUrl(cfg);
  const dbName = parseDatabaseUrl(testUrl)!.dbName;

  const python = findPython();
  console.log(`▶ Python: ${python}`);

  if (await portInUse(cfg.port)) {
    throw new Error(
      `Port ${cfg.port} is already in use. Refusing to continue: whatever is listening may be wired to a ` +
        `different (possibly real) database. Stop it or set TEST_BASE_URL to a free port.`,
    );
  }

  console.log("▶ Preparing disposable test database (reset + migrate + seed + fixtures)…");
  await setupTestDatabase({ reset: true, e2eFixtures: true });
  await assertSafeTestDatabase(testUrl, {
    applicationUrl: getApplicationDatabaseUrl(),
    allowRemote: cfg.allowRemoteDb,
  });
  if (!flag("--shared")) templateName = await createTemplate(testUrl, dbName);

  if (!flag("--skip-build")) {
    console.log("▶ Building the app (vite build)…");
    const vite = path.join(PROJECT_ROOT, "node_modules", "vite", "bin", "vite.js");
    const build = spawnSync(process.execPath, [vite, "build"], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, DATABASE_URL: testUrl },
      encoding: "utf8",
    });
    if (build.status !== 0) throw new Error(`build failed:\n${build.stdout}\n${build.stderr}`);
  }

  const only = option("--only")
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const scripts = readdirSync(E2E_DIR)
    .filter((f) => /^e\d+[a-z]?_.*\.py$/.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .filter((f) => !only || only.some((p) => f.startsWith(p)));
  if (scripts.length === 0) throw new Error("no E2E scripts matched");

  serverExtraEnv = readServerEnv(scripts[0]!);
  rmSync(LOG_FILE, { force: true });
  logStream = createWriteStream(LOG_FILE, { flags: "a" });
  rmSync(cfg.uploadDir, { recursive: true, force: true });
  console.log(`▶ Starting app on ${cfg.baseUrl} (log: ${path.relative(PROJECT_ROOT, LOG_FILE)})…`);
  await startServer(testUrl);

  // Control endpoint used by e4_restart.py (replaces the old, undocumented srv.sh).
  const token = randomBytes(12).toString("hex");
  ctl = http.createServer((req, res) => {
    const [, tok, cmd] = (req.url ?? "").split("/");
    const reply = (code: number, body: string) => void res.writeHead(code).end(body);
    if (req.method !== "POST" || tok !== token) {
      reply(404, "not found");
      return;
    }
    const act =
      cmd === "stop"
        ? stopServer().then(() => "stopped")
        : cmd === "start"
          ? startServer(testUrl).then(() => "started")
          : Promise.reject(new Error("unknown command"));
    act.then((m) => reply(200, m)).catch((e: Error) => reply(500, e.message));
  });
  await new Promise<void>((r) => ctl!.listen(0, "127.0.0.1", r));
  const ctlUrl = `http://127.0.0.1:${(ctl.address() as net.AddressInfo).port}/${token}`;

  const results: { script: string; ok: boolean; summary: string }[] = [];
  for (const script of scripts) {
    const wanted = readServerEnv(script);
    const envChanged = JSON.stringify(wanted) !== JSON.stringify(serverExtraEnv);
    const isolate = !flag("--shared") && results.length > 0;
    if (isolate || envChanged) {
      await stopServer();
      if (isolate) await restoreFromTemplate(testUrl, dbName, templateName!);
      serverExtraEnv = wanted;
      await startServer(testUrl);
    }
    console.log(`\n━━ ${script} ━━`);
    // MUST be async: the control endpoint lives in THIS process, so a blocking spawnSync would deadlock
    // any script (e4_restart) that asks the runner to stop/restart the server.
    const out = await runScript(python, script, {
      ...process.env,
      PYTHONUNBUFFERED: "1",
      TEST_BASE_URL: cfg.baseUrl,
      TEST_DATABASE_URL: testUrl,
      TEST_SESSION_SECRET: cfg.sessionSecret,
      TEST_PASSWORD: cfg.password,
      TEST_FIXTURES_FILE: cfg.fixturesFile,
      TEST_RUN_DIR: cfg.runDir,
      TEST_SERVER_CTL_URL: ctlUrl,
      TEST_PROXY_PORT: String(cfg.port + 7),
    });
    const summary =
      out.text.match(/(\d+)\/(\d+)[^\n]*passed/)?.[0] ?? (out.code === 0 ? "ok" : "no summary");
    results.push({ script, ok: out.code === 0, summary });
  }

  console.log("\n══ E2E summary ══");
  for (const r of results)
    console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.script.padEnd(26)} ${r.summary}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} scripts passed`);
  return failed === 0 ? 0 : 1;
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    void cleanup().finally(() => process.exit(130));
  });
}

main()
  .then(async (code) => {
    await cleanup();
    process.exit(code);
  })
  .catch(async (error: Error) => {
    console.error(`\n✖ ${error.message}`);
    await cleanup();
    process.exit(1);
  });
