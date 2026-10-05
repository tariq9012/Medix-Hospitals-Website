# E2E-SERVER-ENV: REALTIME_SESSION_RECHECK_MS=60000
"""Phase 11 E2E #3b - IMMEDIATE revocation through the real admin Suspend action (server must run with RECHECK=60000
so that only the in-process close hook, not the periodic recheck, can explain a fast close)."""
import time
from common import *

R = Results()
B = CONV["convB"]
sql(f"delete from messages where conversation_id='{B}'")
# reset preconditions (a previously aborted run may have left accounts suspended)
sql(f"update users set status='ACTIVE' where email in ('{USERS['patientB']}','{USERS['doctorB']}')")
sql(f"update doctors set verification_status='APPROVED' where user_id=(select id from users where email='{USERS['doctorB']}')")

def admin_toggle(page, email, action):
    page.goto(f"{BASE}/admin/users"); page.wait_for_selector("main"); hydrated(page)
    page.get_by_placeholder("Search by email…").fill(email)
    row = page.locator("tr", has_text=email)
    row.wait_for(timeout=15000)
    row.get_by_role("button", name=action).click()
    dlg = page.get_by_role("dialog")
    if dlg.locator("textarea").count(): dlg.locator("textarea").fill("Phase 11 realtime revocation test")
    dlg.get_by_role("button", name=f"{action} account").click()

with sync_playwright() as p:
    b = p.chromium.launch()
    ac, admin, _ = login_cookie(b, USERS["platformAdmin"])

    # ---- patient suspended: open app stream + raw stream closed immediately ----
    pc, pb, tok = login_cookie(b, USERS["patientB"])
    pb.goto(f"{BASE}/patient/messages/{B}"); pb.wait_for_selector("main"); hydrated(pb); attach_observer(pb); time.sleep(1.5)
    raw = SSE(tok); R.check("raw stream open before suspension", raw.status == 200); raw.frames(0.8)
    reqs = []; pb.on("request", lambda r: reqs.append(r.url) if "/api/realtime/stream" in r.url else None)
    t0 = time.time(); admin_toggle(admin, USERS["patientB"], "Suspend")
    fr = raw.frames(10); took = time.time() - t0
    R.check("admin Suspend closed the live stream with session-ended (server recheck is 60s, so this is the immediate hook)", "session-ended" in [f[0] for f in fr] and took < 8, f"{[f[0] for f in fr]} in {took:.1f}s")
    R.check("suspended user's status is SUSPENDED in DB", sql(f"select status from users where email='{USERS['patientB']}'") == "SUSPENDED")
    pb.wait_for_timeout(8000)
    obs = pb.evaluate("window.__obsStates")
    R.check("suspended user's browser observer received session-ended", any(x.startswith("session-ended") for x in obs), str(obs))
    R.check("suspended user's app client did NOT hammer the stream endpoint afterwards", len(reqs) <= 1, f"{len(reqs)} reconnect attempts")
    R.check("suspended user cannot open a new stream", SSE(tok).status == 401)
    admin_toggle(admin, USERS["patientB"], "Reactivate"); time.sleep(1)

    # ---- doctor suspended: Phase 10 rules unaffected by realtime ----
    pc2, pb2, _ = login_cookie(b, USERS["patientB"])
    dc, db_, dtok = login_cookie(b, USERS["doctorB"])
    db_.goto(f"{BASE}/doctor/messages/{B}"); db_.wait_for_selector("main"); hydrated(db_); time.sleep(1)
    send_via_ui(db_, "doctor-msg-before-suspension")
    pb2.goto(f"{BASE}/patient/messages/{B}"); pb2.wait_for_selector("main"); hydrated(pb2); attach_observer(pb2); time.sleep(1)
    draw = SSE(dtok); draw.frames(0.8)
    admin_toggle(admin, USERS["doctorB"], "Suspend")
    fr = draw.frames(10)
    R.check("suspended doctor's stream closed immediately", "session-ended" in [f[0] for f in fr], str([f[0] for f in fr]))
    pb2.reload(); pb2.wait_for_selector("main"); hydrated(pb2)
    R.check("history stays readable to the patient (Phase 10 policy)", pb2.locator("p.whitespace-pre-wrap", has_text="doctor-msg-before-suspension").count() == 1)
    R.check("no new message row after account suspension", sql(f"select count(*) from messages where conversation_id='{B}'") == "1")
    admin_toggle(admin, USERS["doctorB"], "Reactivate"); time.sleep(1)

    # ---- Phase 10 PROVIDER suspension (doctors.verification_status) still enforced with realtime on ----
    did = sql(f"select d.id from doctors d join users u on u.id=d.user_id where u.email='{USERS['doctorB']}'")
    prev = sql(f"select verification_status from doctors where id='{did}'")
    sql(f"update doctors set verification_status='SUSPENDED' where id='{did}'")
    pb2.reload(); pb2.wait_for_selector("main"); hydrated(pb2)
    R.check("provider suspended: patient sees notice and NO composer is rendered", pb2.get_by_text("currently suspended").count() >= 1 and pb2.locator("textarea").count() == 0)
    R.check("provider suspended: history still readable", pb2.locator("p.whitespace-pre-wrap", has_text="doctor-msg-before-suspension").count() == 1)
    dc2, d2, _ = login_cookie(b, USERS["doctorB"])
    d2.goto(f"{BASE}/doctor/messages/{B}"); d2.wait_for_selector("main"); hydrated(d2); time.sleep(1)
    box = d2.locator("textarea")
    composer_present = box.count() > 0
    if composer_present:
        box.fill("suspended-doctor-attempt"); box.press("Enter"); time.sleep(2)
    print("INFO suspended provider composer rendered for doctor:", composer_present)
    R.check("provider suspended: doctor cannot send (no row created)", sql("select count(*) from messages where body='suspended-doctor-attempt'") == "0")
    sql(f"update doctors set verification_status='{prev}' where id='{did}'")
    b.close()
R.finish()
