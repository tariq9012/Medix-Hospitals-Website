"""Shared helpers for the browser E2E scripts (Playwright, real Chromium, real server, real PostgreSQL).

Everything environment-specific comes from TEST_* variables that scripts/test/e2e-runner.ts sets
(or that you export yourself when running a single script against a server you started):

  TEST_BASE_URL         where the app is served        (default http://127.0.0.1:4173)
  TEST_DATABASE_URL     the DISPOSABLE test database   (REQUIRED; name must contain "test")
  TEST_SESSION_SECRET   the SESSION_SECRET the server was started with (to mint sessions)
  TEST_PASSWORD         shared password of the seeded fictional accounts
  TEST_FIXTURES_FILE    JSON written by the DB setup ({convA, convB})
  TEST_SERVER_CTL_URL   runner control endpoint (only e4_restart needs it)
  TEST_*_EMAIL          account emails (defaults = seeded accounts)

No absolute paths, no psql binary, no machine-specific locations.
"""
import hmac, hashlib, json, os, re, secrets, shutil, subprocess, time, urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import psycopg
from playwright.sync_api import sync_playwright, expect

PROJECT_ROOT = Path(__file__).resolve().parents[2]
RUN_DIR = Path(os.environ.get("TEST_RUN_DIR", PROJECT_ROOT / ".test-run"))
BASE = os.environ.get("TEST_BASE_URL", "http://127.0.0.1:4173").rstrip("/")
BASE_PORT = int(BASE.rsplit(":", 1)[-1].split("/")[0]) if re.search(r":\d+$", BASE) else 80
PROXY_PORT = int(os.environ.get("TEST_PROXY_PORT", BASE_PORT + 7))
PASSWORD = os.environ.get("TEST_PASSWORD", "MedixDev#2026")  # documented DEV-ONLY seed password

def _require(name):
    v = os.environ.get(name)
    if not v:
        raise SystemExit(f"{name} is not set. Run via `npm run test:e2e` (it sets everything up), "
                         f"or see README -> 'Testing' to run a single script.")
    return v

SESSION_SECRET = _require("TEST_SESSION_SECRET")
_DB_URL = _require("TEST_DATABASE_URL")
# Defence in depth: the Node runner already ran the full fail-closed guard; this re-checks the name.
_dbname = re.sub(r"\?.*$", "", _DB_URL.rsplit("/", 1)[-1])
if not re.search(r"(^|[^a-z0-9])test([^a-z0-9]|$)", _dbname, re.I):
    raise SystemExit(f"Refusing to run E2E against database '{_dbname}': name must contain the word 'test'.")

_fixtures = Path(os.environ.get("TEST_FIXTURES_FILE", RUN_DIR / "fixtures.json"))
CONV = json.loads(_fixtures.read_text()) if _fixtures.exists() else {}

USERS = {
    "patientA": os.environ.get("TEST_PATIENT_EMAIL", "tariq.khan@example.com"),
    "doctorA": os.environ.get("TEST_DOCTOR_EMAIL", "dr.ahmed.raza@medix.example"),
    "patientB": os.environ.get("TEST_PATIENT_B_EMAIL", "patient.b@example.com"),
    "doctorB": os.environ.get("TEST_DOCTOR_B_EMAIL", "dr.sara.khan@medix.example"),
    "hospitalAdmin": os.environ.get("TEST_HOSPITAL_ADMIN_EMAIL", "admin@medixcentral.example"),
    "platformAdmin": os.environ.get("TEST_ADMIN_EMAIL", "platform.admin@medix.example"),
}

_conn = None
def _fmt(v):
    if v is None: return ""
    if isinstance(v, bool): return "t" if v else "f"
    return str(v)

def sql(q):
    """Run SQL on the TEST database; output mimics `psql -At` (rows by newline, columns by '|', t/f booleans)."""
    global _conn
    if _conn is None or _conn.closed:
        _conn = psycopg.connect(_DB_URL, autocommit=True)
    with _conn.cursor() as cur:
        cur.execute(q)
        if cur.description is None:
            return ""
        return "\n".join("|".join(_fmt(c) for c in row) for row in cur.fetchall())

def run_ts(script, *args):
    """Run a project TypeScript helper (needs real service code) behind the fail-closed DB preload.
    Portable: invokes node + tsx directly (no npx/.cmd shims). Returns the last stdout line."""
    node = shutil.which("node") or "node"
    tsx = PROJECT_ROOT / "node_modules" / "tsx" / "dist" / "cli.mjs"
    env = {**os.environ, "TEST_DATABASE_URL": _DB_URL, "TEST_SESSION_SECRET": SESSION_SECRET}
    r = subprocess.run([node, str(tsx), "--import", "./tests/support/preload.ts", script, *args],
                       cwd=str(PROJECT_ROOT), env=env, capture_output=True, text=True, timeout=120)
    lines = r.stdout.strip().splitlines()
    if r.returncode != 0:
        raise SystemExit(f"{script} failed (exit {r.returncode}): {(r.stderr or r.stdout)[-400:]}")
    return lines[-1] if lines else ""

def server_ctl(cmd):
    """Ask the runner to stop/start the app server (replaces the old hidden srv.sh). cmd: 'stop' | 'start'."""
    url = os.environ.get("TEST_SERVER_CTL_URL")
    if not url:
        raise SystemExit("TEST_SERVER_CTL_URL is not set: this script needs the runner (npm run test:e2e).")
    req = urllib.request.Request(f"{url}/{cmd}", method="POST")
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read().decode().strip()

def login(browser, email):
    ctx = browser.new_context()
    page = ctx.new_page()
    page.goto(f"{BASE}/login")
    # Wait for React hydration (it would otherwise wipe values typed too early).
    page.wait_for_function("() => { const f = document.querySelector('form'); return f && Object.keys(f).some(k => k.startsWith('__reactProps')); }", timeout=20000)
    page.locator("#email").fill(email)
    page.locator("#password").fill(PASSWORD)
    assert page.locator("#email").input_value() == email
    page.locator('button[type="submit"]').click()
    page.wait_for_function("!location.pathname.startsWith('/login')", timeout=20000)
    page.wait_for_selector("main", timeout=20000)
    return ctx, page

# In-page raw observer: a SECOND EventSource on the same authenticated cookie that records every frame.
OBSERVER_JS = """
() => {
  window.__ev = window.__ev || [];
  window.__obsStates = window.__obsStates || [];
  const es = new EventSource('/api/realtime/stream', { withCredentials: true });
  window.__obs = es;
  es.addEventListener('realtime', (m) => window.__ev.push(JSON.parse(m.data)));
  es.addEventListener('session-ended', (m) => window.__obsStates.push('session-ended:' + m.data));
  es.addEventListener('ready', () => window.__obsStates.push('ready'));
  es.onerror = () => window.__obsStates.push('error');
}
"""

def attach_observer(page):
    page.evaluate(OBSERVER_JS)
    page.wait_for_function("window.__obsStates && window.__obsStates.includes('ready')", timeout=10000)

def events(page):
    return page.evaluate("window.__ev || []")

def bell(page):
    loc = page.locator('a[href$="/notifications"] span[aria-label$="unread notifications"]')
    return int(loc.inner_text().replace("+", "")) if loc.count() else 0

def wait_bell(page, n, timeout=8000):
    end = time.time() + timeout / 1000
    while time.time() < end:
        if bell(page) == n:
            return True
        time.sleep(0.15)
    return False

def hydrated(page, timeout=20000):
    page.wait_for_function("() => { const b = document.querySelector('nav a, aside a, header button, main button, main a'); return b && Object.keys(b).some(k => k.startsWith('__reactProps')); }", timeout=timeout)

def send_via_ui(page, text):
    """Send through the real composer; success = row is in PostgreSQL AND rendered as a chat bubble."""
    page.wait_for_function("() => document.querySelector('textarea') && document.querySelector('textarea').value === ''", timeout=8000)
    box = page.get_by_label("Message", exact=True)
    box.fill(text)
    box.press("Enter")
    end = time.time() + 8
    while time.time() < end:
        if sql(f"select count(*) from messages where body='{text}'") == "1":
            break
        time.sleep(0.1)
    else:
        toasts = page.locator("[data-sonner-toast]").all_inner_texts()
        (RUN_DIR / "screenshots").mkdir(parents=True, exist_ok=True); page.screenshot(path=str(RUN_DIR / "screenshots" / f"fail-{text}.png"))
        raise AssertionError(f"send of {text!r} never reached PostgreSQL; toasts={toasts}; textarea={box.input_value()!r}; url={page.url}")
    expect(page.locator("p.whitespace-pre-wrap", has_text=text).first).to_be_visible(timeout=8000)

class Results:
    def __init__(self): self.rows = []
    def check(self, name, ok, detail=""):
        self.rows.append((name, bool(ok), detail))
        print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""), flush=True)
    def finish(self):
        bad = [r for r in self.rows if not r[1]]
        print(f"\n{len(self.rows)-len(bad)}/{len(self.rows)} passed")
        raise SystemExit(1 if bad else 0)


def mint_token(email, ttl_seconds=3600):
    """Create a real DB session row exactly like a login would (HMAC-SHA256 of the raw token keyed with the
    server's SESSION_SECRET) and return the raw cookie token. Test database only."""
    token = secrets.token_urlsafe(32)
    token_hash = hmac.new(SESSION_SECRET.encode(), token.encode(), hashlib.sha256).hexdigest()
    uid = sql(f"select id from users where email='{email}'")
    if not uid:
        raise SystemExit(f"mint_token: no user {email!r} in the test database")
    expires = (datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)).isoformat()
    sql(f"insert into auth_sessions (user_id, token_hash, expires_at) values ('{uid}', '{token_hash}', '{expires}')")
    return token

def login_cookie(browser, email, base=None):
    """Same session shape as UI login (httpOnly cookie), without hitting the login rate limiter."""
    token = mint_token(email)
    ctx = browser.new_context()
    ctx.add_cookies([{"name": "medix_session", "value": token, "url": base or BASE, "httpOnly": True, "sameSite": "Lax"}])
    return ctx, ctx.new_page(), token


import select, socket, urllib.parse

class SSE:
    """Minimal raw-socket SSE client (HTTP/1.1 chunk framing is ignored: only event:/data: lines matter)."""
    def __init__(self, token, path="/api/realtime/stream", headers=None):
        u = urllib.parse.urlparse(BASE)
        self.sock = socket.create_connection((u.hostname, u.port), timeout=10)
        h = {"Host": f"{u.hostname}:{u.port}", "Accept": "text/event-stream", "Connection": "keep-alive"}
        if token: h["Cookie"] = f"medix_session={token}"
        h.update(headers or {})
        self.sock.sendall((f"GET {path} HTTP/1.1\r\n" + "".join(f"{k}: {v}\r\n" for k, v in h.items()) + "\r\n").encode())
        self.buf = b""; self.eof = False; self.tail = b""
        head = self._read_until(b"\r\n\r\n", 10)
        self.status = int(head.split(b" ", 2)[1]) if head else 0

    def _fill(self, timeout):
        if self.eof: return
        r, _, _ = select.select([self.sock], [], [], timeout)
        if r:
            chunk = self.sock.recv(65536)
            if not chunk: self.eof = True
            else:
                self.buf += chunk
                self.tail = (self.tail + chunk)[-16:]
                # HTTP/1.1 chunked terminator: the server ended the response (connection may stay keep-alive)
                if self.tail.endswith(b"0\r\n\r\n"): self.eof = True

    def _read_until(self, marker, seconds):
        end = time.time() + seconds
        while marker not in self.buf and time.time() < end and not self.eof:
            self._fill(0.2)
        if marker in self.buf:
            head, self.buf = self.buf.split(marker, 1)
            return head
        return None

    def frames(self, seconds):
        """Collect (event, data) frames for up to `seconds`; appends ('__EOF__','') if the server closed."""
        out, end = [], time.time() + seconds
        while time.time() < end:
            self._fill(0.2)
            while b"\n\n" in self.buf:
                raw, self.buf = self.buf.split(b"\n\n", 1)
                ev, data = None, ""
                for line in raw.decode(errors="ignore").split("\n"):
                    if line.startswith("event:"): ev = line[6:].strip()
                    elif line.startswith("data:"): data = line[5:].strip()
                if ev: out.append((ev, data))
            if self.eof and b"\n\n" not in self.buf:
                out.append(("__EOF__", "")); break
        return out

    def close(self):
        try: self.sock.close()
        except OSError: pass

def sse_open(token, path="/api/realtime/stream", headers=None):
    s = SSE(token, path, headers)
    return s.status, s, s

def sse_read_frames(s, seconds):
    return s.frames(seconds)
