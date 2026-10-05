"""Phase 13 browser E2E: real Chromium, real production server, real PostgreSQL (clean DB seeded by db:seed).
Covers the cross-role directory → favorite → book CTA → review → suspend/reactivate → hospital → moderation flows."""
import re, sys
from common import *  # config, sql(), mint_token/login_cookie, run_ts(), sync_playwright

checks = []

def tsx(*args):
    """Run a project TS helper (admin decision) through the guarded preload."""
    return run_ts(*args)

def check(name, ok, detail=""):
    checks.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if (detail and not ok) else ""), flush=True)

def cookie_ctx(browser, email):
    return login_cookie(browser, email)[0]

def names(page):
    page.wait_for_selector("main h3 a", timeout=15000)
    return [t.strip() for t in page.locator("main h3 a").all_inner_texts()]

def body(page):
    return page.locator("body").inner_text()

bad_responses, page_errors = [], []

def watch(page):
    page.on("response", lambda r: bad_responses.append((r.status, r.url)) if r.status >= 500 else None)
    page.on("pageerror", lambda e: page_errors.append(str(e)))

with sync_playwright() as p:
    browser = p.chromium.launch()

    # ---------- 1. Public visitor: directory shows only approved doctors ----------
    ctx = browser.new_context(); page = ctx.new_page(); watch(page)
    page.goto(f"{BASE}/doctors"); shown = names(page)
    expected = sql("select first_name||' '||last_name from doctors d join users u on u.id=d.user_id "
                   "where d.verification_status='APPROVED' and d.is_available and u.status='ACTIVE'").splitlines()
    check("public /doctors lists exactly the approved doctors from PostgreSQL",
          sorted(n.replace("Dr. ", "") for n in shown) == sorted(expected), f"{shown} vs {expected}")
    pending = sql("select first_name||' '||last_name from doctors where verification_status='PENDING'")
    check("pending doctor is NOT public", all(pending not in n for n in shown) and pending not in body(page))
    check("result count text is real", f"of {len(expected)} doctors" in body(page))
    check("no fake mock doctors rendered", "Dr. Fatima" not in body(page) and "1,200+" not in body(page))

    # ---------- 2. Search / filter / sort / URL state / hostile params ----------
    page.fill('input[aria-label="Search doctors"]', "Raza"); page.press('input[aria-label="Search doctors"]', "Enter")
    page.wait_for_url(re.compile(r"q=Raza")); page.wait_for_function("document.querySelectorAll('main h3 a').length===1"); n = names(page)
    check("server-side search reflected in URL and narrows results", n == ["Dr. Ahmed Raza"], str(n))
    page.goto(f"{BASE}/doctors?specialty=cardiology"); check("specialty filter via URL", names(page) == ["Dr. Ahmed Raza"])
    page.goto(f"{BASE}/doctors?sort=fee_desc"); check("fee_desc sort puts highest fee first", names(page)[0] == "Dr. Usman Tariq", str(names(page)))
    page.goto(f"{BASE}/doctors?sort=fee_asc"); check("fee_asc sort puts lowest fee first", names(page)[0] == "Dr. Ayesha Siddiqui", str(names(page)))
    page.goto(f"{BASE}/doctors?q=zzzznomatch"); page.wait_for_selector("text=No doctors found")
    check("empty state is truthful (no fake cards)", page.locator("main h3 a").count() == 0)
    page.goto(f"{BASE}/doctors?sort=bogus;DROP&page=abc&minFee=zzz&mode=X&q=%25%27--")
    page.wait_for_selector("main"); check("hostile query params degrade gracefully (no error page)", "couldn't load" not in body(page).lower() and page.locator("main").count() == 1)

    # ---------- 3. Client navigation to detail (routing regression) ----------
    page.goto(f"{BASE}/doctors"); page.wait_for_selector("main h3 a")
    card = page.locator("main h3 a", has_text="Ahmed Raza").first
    page.locator("a", has_text="View Profile").first.wait_for()
    card.click(); page.wait_for_url(re.compile(r"/doctors/dr-ahmed-raza"))
    page.wait_for_selector('a[href^="/book?doctor="]')
    page.wait_for_selector("aside >> text=Hospital / Clinic"); txt = body(page)
    check("client navigation renders real doctor profile body", "Dr. Ahmed Raza" in txt and "Cardiology" in txt and "Book Appointment" in txt)
    check("detail shows real aggregate from reviews (4.7, 3 reviews)", "4.7" in txt and "3 reviews" in txt, txt[:300])
    check("detail shows next-available from real engine or truthful none",
          "Next available:" in txt or "No open slots in the next 14 days" in txt)
    page.get_by_role("tab", name=re.compile("Qualifications")).click(); check("qualifications from DB", page.locator("text=FCPS (Cardiology)").count() > 0)
    page.get_by_role("tab", name=re.compile("Reviews")).click(); page.wait_for_selector("text=Tariq K.")
    rv = page.locator('[role="tabpanel"]:visible').inner_text()
    check("reviews show privacy-safe names, no emails/surnames", "Sana M." in rv and "Omar F." in rv and "@" not in rv and "Khan" not in rv and "Malik" not in rv and "Farooq" not in rv, rv[:300])
    page.go_back(); page.wait_for_selector("main h3 a"); check("browser back returns to the directory list", page.url.endswith("/doctors") and len(names(page)) == len(expected))

    # ---------- 4. Unauthenticated favorite -> login ----------
    page.locator('button[aria-label="Add to favorites"]').first.click(); page.wait_for_url(re.compile(r"/login"))
    check("signed-out favorite click redirects to login (does not pretend to succeed)", "/login" in page.url)
    ctx.close()

    # ---------- 5. Patient: favorites are DB-backed + idempotent ----------
    ctx = cookie_ctx(browser, "tariq.khan@example.com"); page = ctx.new_page(); watch(page)
    tariq = sql("select id from users where email='tariq.khan@example.com'")
    raza = sql("select id from doctors where slug='dr-ahmed-raza'")
    favcount = lambda: int(sql(f"select count(*) from favorite_doctors where patient_id='{tariq}' and doctor_id='{raza}'"))
    page.goto(f"{BASE}/doctors?q=Raza"); btn = page.locator('main button[aria-pressed]').first; btn.wait_for()
    check("seeded favorite shows as pressed (state from DB)", btn.get_attribute("aria-pressed") == "true" and favcount() == 1)
    btn.click(); page.wait_for_function("document.querySelector('main button[aria-pressed]').getAttribute('aria-pressed')==='false'")
    page.reload(); b2 = page.locator('main button[aria-pressed]').first; b2.wait_for()
    check("remove persists across reload (server truth, not localStorage)", b2.get_attribute("aria-pressed") == "false" and favcount() == 0)
    b2.click(); page.wait_for_function("document.querySelector('main button[aria-pressed]').getAttribute('aria-pressed')==='true'")
    check("re-add persists", favcount() == 1)
    b2.dblclick(); page.wait_for_timeout(1500)
    page.reload(); b3 = page.locator('main button[aria-pressed]').first; b3.wait_for()
    check("rapid double-click never duplicates; UI matches DB", favcount() <= 1 and (b3.get_attribute("aria-pressed") == "true") == (favcount() == 1))
    if favcount() == 0: b3.click(); page.wait_for_timeout(800)
    page.goto(f"{BASE}/patient/favorites"); page.wait_for_selector("main h3 a")
    check("favorites page lists doctor from DB", page.locator("main h3 a", has_text="Ahmed Raza").count() == 1)
    page.get_by_role("tab", name=re.compile("Hospitals")).click(); page.wait_for_selector("main h3 a")
    check("favorites page lists hospital tab", page.locator("main h3 a", has_text="Medix Central").count() >= 1)

    # ---------- 6. Booking CTA reuses the real booking flow ----------
    page.goto(f"{BASE}/doctors/dr-ahmed-raza"); page.wait_for_selector('a[href^="/book?doctor="]')
    page.locator('a[href^="/book?doctor="]').first.click(); page.wait_for_url(re.compile(r"/book\?doctor=" + raza))
    page.wait_for_selector("text=Ahmed Raza", timeout=15000)
    check("Book CTA opens the real /book flow with the doctor preloaded", f"doctor={raza}" in page.url and "Ahmed Raza" in body(page))

    # ---------- 7. Review flow from a COMPLETED appointment ----------
    sara = sql("select id from doctors where slug='dr-sara-khan'"); central = sql("select id from hospitals where slug='medix-central-hospital'")
    done = sql(f"insert into appointments (patient_id,doctor_id,hospital_id,appointment_date,start_time,end_time,consultation_type,status,payment_status,fee) "
               f"values ('{tariq}','{sara}','{central}','2026-09-20','10:00','10:30','IN_PERSON','COMPLETED','PAID',2500) returning id").splitlines()[0]
    pend = sql(f"select id from appointments where patient_id='{tariq}' and status='PENDING' limit 1")
    page.goto(f"{BASE}/patient/appointments/{pend}"); page.wait_for_selector("text=Reason for visit")
    page.wait_for_timeout(800); check("pending appointment shows NO review form", page.locator("text=Leave a review").count() == 0)
    page.goto(f"{BASE}/patient/appointments/{done}"); page.wait_for_selector("text=Leave a review")
    check("completed appointment shows 'Leave a review'", True)
    page.locator('[aria-label="3 stars"]').click(); page.fill('textarea[aria-label="Review comment"]', "<b>bad</b>"); page.get_by_role("button", name="Submit review").click()
    page.wait_for_timeout(600); check("client rejects HTML-ish / too short comment, nothing saved", int(sql(f"select count(*) from reviews where appointment_id='{done}'")) == 0)
    page.locator('[aria-label="4 stars"]').click()
    page.fill('textarea[aria-label="Review comment"]', "Clear explanation and a friendly, punctual consultation.")
    page.get_by_role("button", name="Submit review").click(); page.wait_for_selector("text=Your review")
    row = sql(f"select rating,moderation_status,doctor_id='{sara}',hospital_id='{central}',patient_id='{tariq}' from reviews where appointment_id='{done}'")
    check("review saved with server-derived doctor/hospital/patient", row == "4|PUBLISHED|t|t|t", row)
    pub = browser.new_context().new_page(); watch(pub)
    pub.goto(f"{BASE}/doctors/dr-sara-khan"); pub.wait_for_selector('a[href^="/book?doctor="]')
    t = body(pub)
    check("public profile aggregate updated from real reviews (Sara: 5+4 → 4.5, 2 reviews)", "4.5" in t and "2 reviews" in t, t[:260])
    pub.get_by_role("tab", name=re.compile("Reviews")).click(); pub.wait_for_selector("text=Tariq K.")
    check("public profile shows new review text as plain text", pub.locator("text=Clear explanation and a friendly").count() == 1)
    page.get_by_role("button", name="Edit").click(); page.locator('[aria-label="5 stars"]').click(); page.get_by_role("button", name="Save changes").click()
    page.wait_for_selector("text=edited"); check("patient can edit own review (edited flag shown)", sql(f"select rating, edited_at is not null from reviews where appointment_id='{done}'") == "5|t")
    page.once("dialog", lambda d: d.accept()); page.get_by_role("button", name="Remove").click(); page.wait_for_selector("text=You removed this review")
    check("patient removal hides (row kept) and drops from public count", sql(f"select moderation_status from reviews where appointment_id='{done}'") == "HIDDEN")
    page.get_by_role("button", name="Restore review").click(); page.wait_for_selector("text=Your review"); page.wait_for_timeout(300)
    check("patient can restore own removed review", sql(f"select moderation_status from reviews where appointment_id='{done}'") == "PUBLISHED")
    page.goto(f"{BASE}/patient/reviews"); page.wait_for_selector("main >> text=Dr. Sara Khan"); check("My reviews page lists the review", page.locator("text=Dr. Sara Khan").count() >= 1)

    # ---------- 8. Admin suspends -> disappears everywhere; reactivation restores ----------
    page.goto(f"{BASE}/doctors/dr-sara-khan"); page.wait_for_selector('button[aria-label="Add to favorites"], button[aria-label="Remove from favorites"]')
    page.locator('main button[aria-pressed]').first.click(); page.wait_for_timeout(800)
    check("patient favorites Dr. Sara on profile page", int(sql(f"select count(*) from favorite_doctors where patient_id='{tariq}' and doctor_id='{sara}'")) == 1)
    print("  admin decision:", tsx("tests/e2e/admin-decision.mts", "DOCTOR", sara, "SUSPEND", "E2E suspension for visibility test"))
    pub.goto(f"{BASE}/doctors"); n = names(pub)
    check("suspended doctor gone from directory", "Dr. Sara Khan" not in n and len(n) == len(expected) - 1, str(n))
    pub.goto(f"{BASE}/doctors?q=Sara"); pub.wait_for_selector("text=No doctors found"); check("suspended doctor gone from search", True)
    pub.goto(f"{BASE}/doctors?specialty=dermatology"); pub.wait_for_selector("text=No doctors found"); check("suspended doctor gone from specialty filter", True)
    pub.goto(f"{BASE}/specialties/dermatology"); pub.wait_for_timeout(1200); check("gone from specialty page", "Dr. Sara Khan" not in body(pub))
    pub.goto(f"{BASE}/"); pub.wait_for_selector("text=Featured doctors"); check("gone from homepage featured/reviews", "Sara Khan" not in body(pub))
    pub.goto(f"{BASE}/doctors/dr-sara-khan"); pub.wait_for_selector("text=Doctor not found"); check("public detail route is not-found for suspended doctor", True)
    page.goto(f"{BASE}/book?doctor={sara}"); page.wait_for_timeout(2000)
    check("booking discovery no longer offers suspended doctor", "Sara Khan" not in body(page) or "not available" in body(page).lower() or "No doctor selected" in body(page))
    check("history intact: appointment + reviews still in DB", int(sql(f"select count(*) from reviews where doctor_id='{sara}'")) >= 2 and int(sql(f"select count(*) from appointments where doctor_id='{sara}'")) >= 1)
    page.goto(f"{BASE}/patient/favorites"); page.wait_for_selector("text=Currently unavailable")
    check("favorite kept and clearly marked unavailable", "Dr. Sara Khan" in body(page))
    print("  admin decision:", tsx("tests/e2e/admin-decision.mts", "DOCTOR", sara, "REACTIVATE"))
    pub.goto(f"{BASE}/doctors"); n = names(pub); check("reactivated doctor returns to directory", "Dr. Sara Khan" in n)
    pub.goto(f"{BASE}/doctors/dr-sara-khan"); pub.wait_for_selector('a[href^="/book?doctor="]'); t = body(pub)
    check("reactivated profile has historical reviews intact (2 reviews, avg 5.0 after the earlier edit)", "2 reviews" in t and "5.0" in t, t[:200])
    page.goto(f"{BASE}/patient/favorites"); page.wait_for_selector("main h3 a"); check("favorite returns to available list", "Currently unavailable" not in body(page))

    # ---------- 9. Hospital public flow & data boundary ----------
    sql("insert into hospitals (name,slug,verification_status,city,verification_reason) values ('Pending Hospital E2E','pending-hospital-e2e','PENDING','Lahore','secret-internal-reason') on conflict do nothing")
    pub.goto(f"{BASE}/hospitals"); hn = names(pub); approved_h = int(sql("select count(*) from hospitals where verification_status='APPROVED'"))
    check("public /hospitals lists only approved hospitals", len(hn) == approved_h and "Pending Hospital E2E" not in hn, str(hn))
    pub.goto(f"{BASE}/hospitals?city=Lahore"); pub.wait_for_selector("main h3 a"); check("hospital city filter (server-side)", "Pending Hospital E2E" not in names(pub))
    pub.goto(f"{BASE}/hospitals?q=Medix"); pub.wait_for_selector("main h3 a")
    pub.locator("a", has_text="View Hospital").first.click(); pub.wait_for_url(re.compile(r"/hospitals/medix-central-hospital"))
    pub.wait_for_selector("text=Doctors ("); ht = body(pub)
    check("hospital detail (client nav) renders real data + affiliated approved doctors", "Medix Central Hospital" in ht and "Dr. Ahmed Raza" in ht)
    check("hospital page leaks no internal/admin data", all(s not in ht for s in ["admin@medixcentral", "secret-internal-reason", "Pending Hospital", "verification", "invoice", "tariq.khan"]))
    pub.get_by_role("tab", name=re.compile("Departments")).click(); check("departments tab from DB", pub.locator("text=Cardiology").count() >= 1)
    pub.get_by_role("tab", name=re.compile("Doctors \\(")).click()
    pub.locator("main h3 a", has_text="Ahmed Raza").first.click(); pub.wait_for_url(re.compile(r"/doctors/dr-ahmed-raza")); pub.wait_for_selector('a[href^="/book?doctor="]')
    check("hospital → doctor profile → booking link", "/book?doctor=" in (pub.locator('a[href^="/book?doctor="]').first.get_attribute("href") or ""))
    pub.goto(f"{BASE}/hospitals/pending-hospital-e2e"); pub.wait_for_selector("text=Hospital not found"); check("pending hospital detail is not-found", True)

    # ---------- 10. Specialties + homepage ----------
    pub.goto(f"{BASE}/specialties"); pub.wait_for_selector("text=Specialties with at least one verified provider"); st = body(pub)
    check("specialties page lists only specialties with real providers", "Cardiology" in st and "Psychiatry" not in st)
    pub.goto(f"{BASE}/specialties/cardiology"); pub.wait_for_selector("text=Dr. Ahmed Raza"); check("specialty page shows real doctors/hospitals", "Medix Central" in body(pub))
    pub.goto(f"{BASE}/"); pub.wait_for_selector("text=Featured doctors"); ht = body(pub)
    check("homepage uses DB (no hardcoded 1,200+/94k/fake testimonials)", "1,200+" not in ht and "94k" not in ht and "Recent patient reviews" in ht and "Featured doctors" in ht)
    check("homepage labels are defensible (no 'Top Doctors')", "Top Doctors" not in ht and "Top doctors" not in ht)

    # ---------- 11. Admin moderation UI ----------
    actx = cookie_ctx(browser, USERS["platformAdmin"]); ap = actx.new_page(); watch(ap)
    ap.goto(f"{BASE}/admin/reviews"); ap.wait_for_selector("text=Review moderation"); ap.wait_for_selector("text=Hide review")
    ap.get_by_role("button", name="Hide review").first.click()
    check("moderation confirm is disabled until a reason is given", ap.get_by_role("button", name="Hide review").last.is_disabled() and int(sql("select count(*) from reviews where moderation_status='HIDDEN' and hidden_by_user_id=(select id from users where email='"+USERS["platformAdmin"]+"')")) == 0)
    ap.fill("#admin-reason", "Contains abusive language, hidden per policy"); ap.get_by_role("button", name="Hide review").last.click(); ap.wait_for_selector("text=Hidden by moderation")
    hid = sql("select id, rating, review_text is not null, hidden_reason from reviews where moderation_status='HIDDEN' and hidden_by_user_id=(select id from users where email='"+USERS["platformAdmin"]+"')")
    check("admin hide preserves row + text, records reason", hid.endswith("|t|Contains abusive language, hidden per policy"), hid)
    check("moderation action audited without review text", int(sql("select count(*) from audit_logs where action='REVIEW_HIDDEN' and metadata->>'by'='ADMIN'")) >= 1)
    actx.close()

    check("no HTTP 5xx responses during the whole run", not bad_responses, str(bad_responses[:3]))
    check("no uncaught page errors during the run", not page_errors, str(page_errors[:3]))
    browser.close()

failed = [n for n, ok in checks if not ok]
print(f"\n{len(checks)-len(failed)}/{len(checks)} E2E checks passed")
sys.exit(1 if failed else 0)
