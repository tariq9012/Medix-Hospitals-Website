"""E2E #11 - end-to-end workflows across roles, smoke of EVERY static portal route, RBAC matrix, cross-patient access.

A. Real UI workflow: patient logs in through the real login form -> books via the 6-step booking UI ->
   doctor confirms (exactly one invoice) -> appointment becomes completed -> patient reviews -> public rating.
B. Smoke: every static route of every portal + public pages, auto-discovered from src/routes (so new routes
   are covered automatically). Asserts HTTP < 400, the page renders, no error boundary, no 5xx, no page error.
C. RBAC: signed-out visitors and wrong-role users are kept out of every portal.
D. Cross-patient access (IDOR): Patient B cannot read Patient A's appointment or invoice - with POSITIVE
   CONTROLS (A can) so an empty/errored page can never be mistaken for "denied".

Time-travel shortcut (documented): after booking a future slot, the appointment date is moved into the past
by SQL so the doctor's real "Mark completed" action is legitimately allowed. Nothing else is shortcut.
"""
import re
import time

from common import *

R = Results()
BAD = re.compile(r"(Something went wrong|Page not found|404|Internal Server Error|Unexpected Application Error)", re.I)
bad_responses, page_errors = [], []


def watch(page):
    page.on("response", lambda r: bad_responses.append((r.status, r.url)) if r.status >= 500 else None)
    page.on("pageerror", lambda e: page_errors.append(str(e)))


def wait_status(appt, wanted, seconds=10):
    end, status = time.time() + seconds, ""
    while time.time() < end:
        status = sql(f"select status from appointments where id='{appt}'")
        if status == wanted:
            return status
        time.sleep(0.25)
    return status


def goto(page, url, **kw):
    """page.goto that first lets any in-flight client navigation settle and retries a one-off ERR_ABORTED."""
    # NOT networkidle: the realtime SSE stream keeps a connection open, so it would never fire.
    page.wait_for_timeout(250)
    for attempt in range(3):
        try:
            return page.goto(url, **kw)
        except Exception as e:  # noqa: BLE001
            if "ERR_ABORTED" not in str(e) or attempt == 2:
                raise
            page.wait_for_timeout(500)


def static_routes(prefix):
    """Static (non-parameterised) routes from the route files: patient.appointments.index.tsx -> /patient/appointments."""
    out = []
    for f in sorted((PROJECT_ROOT / "src" / "routes").glob(f"{prefix}.*.tsx")):
        parts = f.stem.split(".")
        if any("$" in p for p in parts):
            continue
        if parts[-1] == "index":
            parts = parts[:-1]
        out.append("/" + "/".join(parts))
    return sorted(set(out))


patient_a = sql(f"select id from users where email='{USERS['patientA']}'")
patient_b = sql(f"select id from users where email='{USERS['patientB']}'")
raza_id = sql(f"select d.id from doctors d join users u on u.id=d.user_id where u.email='{USERS['doctorA']}'")
raza_slug = sql(f"select slug from doctors where id='{raza_id}'")

with sync_playwright() as p:
    browser = p.chromium.launch()

    # ───────────────────────── A. booking → confirm → complete → review (real UI) ─────────────────────────
    pctx, ppage = login(browser, USERS["patientA"])  # REAL login form
    watch(ppage)
    R.check("patient can log in through the real login form and reaches the portal", "/login" not in ppage.url)
    ppage.goto(f"{BASE}/patient/dashboard"); ppage.wait_for_selector("main")
    R.check("patient dashboard renders after UI login", not BAD.search(ppage.inner_text("main")[:300]))

    before = int(sql(f"select count(*) from appointments where patient_id='{patient_a}'"))
    ppage.goto(f"{BASE}/book?doctor={raza_id}")
    ppage.wait_for_selector("h2:has-text('Select a doctor')", timeout=20000)
    ppage.wait_for_selector('button[aria-pressed="true"]', timeout=20000)   # ?doctor= preselects the doctor
    R.check("booking page opens with the chosen doctor preselected", ppage.locator('button[aria-pressed="true"]').count() == 1)
    ppage.get_by_role("button", name="Continue").click()                       # step 0 -> step 1
    ppage.wait_for_selector("h2:has-text('Select a date')", timeout=20000)

    picked = False
    date_buttons = ppage.locator("button[aria-pressed]")
    for i in range(date_buttons.count()):
        date_buttons.nth(i).click()
        ppage.wait_for_timeout(700)
        enabled = ppage.locator("button:not([disabled])").filter(has_text=re.compile(r"^\d{2}:\d{2}$"))
        if enabled.count() > 0:
            slot_text = enabled.first.inner_text().strip()
            enabled.first.click()
            picked = True
            break
    R.check("real availability engine offered a bookable slot", picked)

    if picked:
        ppage.get_by_role("button", name="Continue").click()                    # → appointment type
        ppage.wait_for_selector("h2:has-text('Appointment type')")
        ppage.locator("#type-IN_PERSON").click()
        ppage.get_by_role("button", name="Continue").click()                    # → reason
        ppage.get_by_placeholder("e.g. Follow-up for blood pressure").fill("E2E workflow: routine check-up")
        ppage.get_by_role("button", name="Continue").click()                    # → review
        ppage.get_by_role("button", name="Confirm booking").click()
        ppage.wait_for_selector("text=Appointment Requested", timeout=20000)
        R.check("booking UI completes with 'Appointment Requested'", True)

    row = sql(f"select id, status, fee from appointments where patient_id='{patient_a}' order by created_at desc limit 1")
    appt = row.split("|")[0] if int(sql(f"select count(*) from appointments where patient_id='{patient_a}'")) > before else ""
    R.check("a real PENDING appointment row exists for the patient with a fee snapshot",
            bool(appt) and row.split("|")[1] == "PENDING" and row.split("|")[2] not in ("", "0", "0.00"), row)
    R.check("no invoice exists before the doctor confirms", appt and int(sql(f"select count(*) from invoices where appointment_id='{appt}'")) == 0)

    dctx, dpage = login(browser, USERS["doctorA"])                               # REAL login form (doctor)
    watch(dpage)
    goto(dpage, f"{BASE}/doctor/appointments/{appt}"); dpage.wait_for_selector("main")
    dpage.get_by_role("button", name="Confirm appointment").click()
    R.check("doctor confirms through the Doctor Portal", wait_status(appt, "CONFIRMED") == "CONFIRMED")
    R.check("confirmation generated exactly ONE invoice (Phase 12 regression)",
            int(sql(f"select count(*) from invoices where appointment_id='{appt}'")) == 1)

    sql(f"update appointments set appointment_date = current_date - 1 where id='{appt}'")   # documented time-travel
    goto(dpage, f"{BASE}/doctor/appointments/{appt}"); dpage.wait_for_selector("main")
    dpage.get_by_role("button", name="Mark completed").click()
    R.check("doctor completes the (now past) appointment", wait_status(appt, "COMPLETED") == "COMPLETED")
    R.check("completing did not create a second invoice", int(sql(f"select count(*) from invoices where appointment_id='{appt}'")) == 1)

    goto(ppage, f"{BASE}/patient/appointments/{appt}"); ppage.wait_for_selector("text=Leave a review", timeout=15000)
    ppage.locator('[aria-label="5 stars"]').click()
    ppage.fill('textarea[aria-label="Review comment"]', "Booked, confirmed and completed end to end in the test.")
    ppage.get_by_role("button", name="Submit review").click()
    ppage.wait_for_selector("text=Your review", timeout=15000)
    rv = sql(f"select rating, moderation_status, doctor_id='{raza_id}', patient_id='{patient_a}' from reviews where appointment_id='{appt}'")
    R.check("review stored for the completed appointment (server-derived ids)", rv == "5|PUBLISHED|t|t", rv)
    pub = browser.new_context().new_page(); watch(pub)
    pub.goto(f"{BASE}/doctors/{raza_slug}"); pub.wait_for_selector("aside >> text=Hospital / Clinic")
    cnt = int(sql(f"select count(*) from reviews where doctor_id='{raza_id}' and moderation_status='PUBLISHED'"))
    R.check("public doctor profile reflects the new review count", f"{cnt} reviews" in pub.inner_text("body"), f"expected {cnt}")
    pctx.close(); dctx.close()

    # ───────────────────────── B. smoke every static route for every role ─────────────────────────
    portals = [("patientA", "patient"), ("doctorA", "doctor"), ("hospitalAdmin", "hospital"), ("platformAdmin", "admin")]
    for who, prefix in portals:
        ctx, page, _ = login_cookie(browser, USERS[who])
        watch(page)
        routes = static_routes(prefix)
        failures = []
        for path in routes:
            try:
                # "/new" pages only exist in the context of a COMPLETED appointment (bare access is a correct not-found).
                target = f"{path}?appointmentId={appt}" if path.endswith("/new") else path
                resp = goto(page, BASE + target, timeout=30000)
                page.wait_for_selector("main", timeout=15000)
                text = page.inner_text("main")[:400]
                if resp.status >= 400 or BAD.search(text) or not text.strip():
                    failures.append(f"{path} ({resp.status})")
            except Exception as e:  # noqa: BLE001
                failures.append(f"{path} ({type(e).__name__})")
        R.check(f"{who}: all {len(routes)} static /{prefix}/* routes render without errors", not failures, "; ".join(failures))
        ctx.close()

    pub_ctx = browser.new_context(); pg = pub_ctx.new_page(); watch(pg)
    public = ["/", "/doctors", "/hospitals", "/specialties", "/about", "/contact", "/articles", "/login", "/register"]
    pub_fail = []
    for path in public:
        try:
            resp = goto(pg, BASE + path)
            pg.wait_for_selector("main, form", timeout=15000)   # /login and /register use AuthShell (a form, no <main>)
            if resp.status >= 400 or BAD.search(pg.inner_text("body")[:600]):
                pub_fail.append(f"{path} ({resp.status})")
        except Exception as e:  # noqa: BLE001
            pub_fail.append(f"{path} ({type(e).__name__})")
    R.check(f"public: all {len(public)} public pages render", not pub_fail, ", ".join(pub_fail))
    slug_h = sql("select slug from hospitals where verification_status='APPROVED' limit 1")
    for path in (f"/doctors/{raza_slug}", f"/hospitals/{slug_h}", "/specialties/cardiology"):
        resp = goto(pg, BASE + path); pg.wait_for_selector("main")
        R.check(f"public detail {path[:34]} renders", resp.status < 400 and not BAD.search(pg.inner_text("main")[:300]))
    pub_ctx.close()

    # ───────────────────────── C. RBAC matrix ─────────────────────────
    anon = browser.new_context().new_page()
    for _, prefix in portals:
        goto(anon, f"{BASE}/{prefix}/dashboard"); anon.wait_for_timeout(1200)
        R.check(f"signed-out visitor is sent to /login from /{prefix}/dashboard", "/login" in anon.url, anon.url)
    for who, prefix in portals:
        ctx, page, _ = login_cookie(browser, USERS[who])
        for _, other in portals:
            if other == prefix:
                continue
            goto(page, f"{BASE}/{other}/dashboard"); page.wait_for_timeout(1200)
            landed = re.sub(r"^https?://[^/]+", "", page.url)
            R.check(f"{who} cannot open /{other}/dashboard", not landed.startswith(f"/{other}/"), landed)
        ctx.close()

    # ───────────────────────── D. cross-patient access (with positive controls) ─────────────────────────
    marker = f"IDOR-MARKER-{int(time.time())}"
    victim_appt = sql(f"select id from appointments where patient_id='{patient_a}' and id <> '{appt}' order by created_at limit 1") or appt
    sql(f"update appointments set reason_for_visit='{marker}' where id='{victim_appt}'")
    victim_inv = sql(f"select id from invoices where patient_id='{patient_a}' limit 1")
    inv_no = sql(f"select invoice_number from invoices where id='{victim_inv}'") if victim_inv else ""

    actx, apage, _ = login_cookie(browser, USERS["patientA"]); watch(apage)
    bctx, bpage, _ = login_cookie(browser, USERS["patientB"]); watch(bpage)

    apage.goto(f"{BASE}/patient/appointments/{victim_appt}"); apage.wait_for_selector("main")
    apage.wait_for_function("(m) => document.body.innerText.includes(m)", arg=marker, timeout=15000)
    R.check("control: the owner CAN see their own appointment details", marker in apage.inner_text("body"))
    bpage.goto(f"{BASE}/patient/appointments/{victim_appt}"); bpage.wait_for_selector("main"); bpage.wait_for_timeout(1500)
    R.check("Patient B cannot read Patient A's appointment (no private content rendered)", marker not in bpage.inner_text("body"))

    if victim_inv:
        apage.goto(f"{BASE}/patient/payments/{victim_inv}"); apage.wait_for_selector("main")
        apage.wait_for_function("(m) => document.body.innerText.includes(m)", arg=inv_no, timeout=15000)
        R.check("control: the owner CAN see their own invoice", inv_no in apage.inner_text("body"))
        bpage.goto(f"{BASE}/patient/payments/{victim_inv}"); bpage.wait_for_selector("main"); bpage.wait_for_timeout(1500)
        R.check("Patient B cannot read Patient A's invoice", inv_no not in bpage.inner_text("body"))
    actx.close(); bctx.close()

    R.check("no HTTP 5xx responses during the whole run", not bad_responses, str(bad_responses[:3]))
    R.check("no uncaught page errors during the whole run", not page_errors, str(page_errors[:3]))
    browser.close()

R.finish()
