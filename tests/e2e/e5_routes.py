"""Phase 11 E2E #5 - routing regression (list -> detail via real client-side navigation) + smoke crawl of every role's routes."""
import re, time
from common import *

R = Results()
A = CONV["convA"]
BAD = re.compile(r"(Something went wrong|Page not found|404|Internal Server Error|Unexpected Application Error)", re.I)
UUID = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"

LISTS = {
  "patientA": ["/patient/dashboard","/patient/appointments","/patient/medical-history","/patient/prescriptions","/patient/reports","/patient/messages","/patient/notifications","/patient/payments","/patient/favorites","/patient/reviews","/patient/settings"],
  "doctorA": ["/doctor/dashboard","/doctor/profile","/doctor/appointments","/doctor/availability","/doctor/patients","/doctor/records","/doctor/prescriptions","/doctor/reports","/doctor/messages","/doctor/notifications","/doctor/earnings","/doctor/reviews","/doctor/analytics","/doctor/settings"],
  "hospitalAdmin": ["/hospital/dashboard","/hospital/profile","/hospital/doctors","/hospital/departments","/hospital/patients","/hospital/appointments","/hospital/analytics","/hospital/services","/hospital/schedules","/hospital/staff","/hospital/rooms-beds","/hospital/settings"],
  "platformAdmin": ["/admin/dashboard","/admin/users","/admin/doctors","/admin/patients","/admin/hospitals","/admin/appointments","/admin/doctor-verification","/admin/hospital-verification","/admin/departments","/admin/specializations","/admin/notifications","/admin/activity-logs","/admin/reports","/admin/settings","/admin/payments","/admin/reviews","/admin/articles"],
}
# list page -> href pattern of its detail links (real navigation must render the DETAIL route, not the list again)
PAIRS = {
  "patientA": [("/patient/appointments", r"^/patient/appointments/"+UUID), ("/patient/medical-history", r"^/patient/medical-history/"+UUID), ("/patient/prescriptions", r"^/patient/prescriptions/"+UUID), ("/patient/messages", r"^/patient/messages/"+UUID)],
  "doctorA": [("/doctor/appointments", r"^/doctor/appointments/"+UUID), ("/doctor/patients", r"^/doctor/patients/"+UUID), ("/doctor/records", r"^/doctor/records/"+UUID), ("/doctor/prescriptions", r"^/doctor/prescriptions/"+UUID), ("/doctor/messages", r"^/doctor/messages/"+UUID)],
  "platformAdmin": [("/admin/doctor-verification", r"^/admin/doctor-verification/"+UUID), ("/admin/hospital-verification", r"^/admin/hospital-verification/"+UUID)],
}

with sync_playwright() as p:
    b = p.chromium.launch()
    for who, paths in LISTS.items():
        ctx, page, _ = login_cookie(b, USERS[who])
        errs = []; s5 = []
        page.on("pageerror", lambda e: errs.append(str(e)[:120]))
        page.on("console", lambda m: errs.append(m.text[:120]) if m.type == "error" and "realtime" not in m.text.lower() else None)
        page.on("response", lambda r: s5.append(f"{r.status} {r.url}") if r.status >= 500 else None)
        bad = []
        for path in paths:
            resp = page.goto(BASE + path); page.wait_for_selector("main", timeout=15000)
            txt = page.inner_text("main")
            if resp.status >= 400 or BAD.search(txt[:400]): bad.append((path, resp.status))
        R.check(f"{who}: all {len(paths)} routes render (SSR, no 4xx/5xx/error boundary)", not bad, str(bad))
        R.check(f"{who}: no 5xx responses / page errors while crawling", not s5 and not errs, str((s5 + errs)[:3]))

        for lst, pat in PAIRS.get(who, []):
            page.goto(BASE + lst); page.wait_for_selector("main"); hydrated(page)
            list_text = page.inner_text("main")
            hrefs = page.eval_on_selector_all("main a", "els => els.map(e => e.getAttribute('href'))")
            match = [h for h in hrefs if h and re.match(pat, h)]
            if not match:
                print(f"  SKIPPED (not counted): {who} {lst} has no detail links in fixtures - NOT exercised"); continue
            href = match[0]
            page.locator(f'main a[href="{href}"]').first.click()
            page.wait_for_function("(h) => location.pathname === h", arg=href, timeout=15000)
            time.sleep(1.2)
            detail_text = page.inner_text("main")
            differs = detail_text.strip() != list_text.strip()
            is_msg = "/messages" in lst
            ok = differs and not BAD.search(detail_text[:400]) and (page.locator("textarea").count() > 0 if is_msg else True)
            R.check(f"{who}: client-side {lst} -> detail renders the DETAIL route (not the list again)", ok, href[-40:])
            page.go_back(); page.wait_for_function("(p) => location.pathname === p", arg=lst, timeout=10000)
        ctx.close()

    # public detail routes + direct deep link into messaging detail for both parties
    ctx, page, _ = login_cookie(b, USERS["patientA"])
    # Public directory pages are database-backed (Phase 13): address real, approved providers by slug.
    did = sql(f"select slug from doctors d join users u on u.id=d.user_id where u.email='{USERS['doctorA']}'")
    hid = sql(f"select h.slug from hospitals h join hospital_doctors hd on hd.hospital_id=h.id join doctors d on d.id=hd.doctor_id join users u on u.id=d.user_id where u.email='{USERS['doctorA']}' order by hd.is_primary desc limit 1")
    assert did and hid, "seed should provide an approved doctor with a hospital affiliation"
    apid = sql(f"select id from appointments where patient_id=(select id from users where email='{USERS['patientA']}') limit 1")
    for path in (f"/doctors/{did}", f"/hospitals/{hid}", f"/patient/messages/{A}", f"/patient/appointments/{apid}"):
        resp = page.goto(BASE + path); page.wait_for_selector("main"); R.check(f"deep link {path[:32]} renders", resp.status < 400 and not BAD.search(page.inner_text("main")[:300]))
    b.close()
R.finish()
