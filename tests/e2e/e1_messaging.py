"""Phase 11 E2E #1 - live messaging, conversation list, open conversation, bell, read state, multi-tab, rapid burst."""
import time
from common import *

R = Results()
A, B = CONV["convA"], CONV["convB"]
sql("delete from messages where conversation_id in ('%s','%s')" % (A, B))
sql("delete from notifications")

with sync_playwright() as p:
    browser = p.chromium.launch()
    pctx, patient = login(browser, USERS["patientA"])
    dctx, doctor = login(browser, USERS["doctorA"])

    # Doctor has the conversation OPEN; a second doctor tab sits on the conversation LIST.
    doctor.goto(f"{BASE}/doctor/messages/{A}")
    doctor_list = dctx.new_page(); doctor_list.goto(f"{BASE}/doctor/messages")
    patient.goto(f"{BASE}/patient/messages/{A}")
    for pg in (doctor, doctor_list, patient):
        pg.wait_for_selector("main"); hydrated(pg)
        attach_observer(pg)
    doctor_navs = []
    doctor.on("framenavigated", lambda f: doctor_navs.append(f.url))
    doctor.evaluate("window.__marker = 'no-reload'")

    # ---- 1-7: Patient -> Doctor, NO refresh on the doctor side --------------------------
    send_via_ui(patient, "Hello doctor, live message #1")
    expect(doctor.get_by_text("Hello doctor, live message #1", exact=True)).to_be_visible(timeout=8000)
    R.check("Patient->Doctor: message appears in doctor's OPEN conversation without refresh", True)
    R.check("doctor page was NOT reloaded", doctor.evaluate("window.__marker") == "no-reload")
    R.check("doctor bell badge updated to 1 automatically", wait_bell(doctor, 1), f"bell={bell(doctor)}")
    # doctor's list tab: preview + timestamp without reload, then unread state reflects DB
    expect(doctor_list.get_by_text("Hello doctor, live message #1")).to_be_visible(timeout=8000)
    R.check("Doctor conversation LIST updated live (preview text) without refresh", True)
    time.sleep(1.2)
    unread_db = sql(f"select count(*) from messages where conversation_id='{A}' and read_at is null and sender_id=(select id from users where email='{USERS['patientA']}')")
    R.check("open+visible conversation auto-marked incoming message read in DB", unread_db == "0", f"unread_in_db={unread_db}")
    R.check("doctor list shows no unread badge (read state synced)", doctor_list.locator("span.rounded-full.bg-primary").count() == 0)
    R.check("DB has exactly 1 message row", sql(f"select count(*) from messages where conversation_id='{A}'") == "1")
    R.check("doctor sees exactly 1 rendered copy", doctor.get_by_text("Hello doctor, live message #1", exact=True).count() == 1)

    # ---- 8-11: Doctor replies, Patient no refresh ---------------------------------------
    patient.evaluate("window.__marker = 'no-reload'")
    send_via_ui(doctor, "Reply from doctor, live #2")
    expect(patient.get_by_text("Reply from doctor, live #2", exact=True)).to_be_visible(timeout=8000)
    R.check("Doctor->Patient: reply appears without refresh", True)
    R.check("patient page NOT reloaded", patient.evaluate("window.__marker") == "no-reload")
    R.check("patient bell badge updated to 1 automatically", wait_bell(patient, 1), f"bell={bell(patient)}")

    # ---- events observed carry ids only (privacy) ----------------------------------------
    evs = events(doctor)
    R.check("doctor observer received MESSAGE_CREATED + NOTIFICATION_CREATED", {"MESSAGE_CREATED", "NOTIFICATION_CREATED"} <= {e["type"] for e in evs}, str(sorted({e['type'] for e in evs})))
    blob = str(evs)
    R.check("no message body / names leaked in any realtime payload", "live message" not in blob and "Tariq" not in blob and "Hello" not in blob)

    # ---- 17/38: multi-tab, notification read sync ----------------------------------------
    n1 = pctx.new_page(); n1.goto(f"{BASE}/patient/notifications")
    n2 = pctx.new_page(); n2.goto(f"{BASE}/patient/notifications")
    expect(n1.get_by_text("You have a new message from Dr. Ahmed Raza.").first).to_be_visible(timeout=8000)
    R.check("both patient tabs list the notification", n2.get_by_text("You have a new message from Dr. Ahmed Raza.").count() >= 1)
    for tab in (n1, n2):
        tab.wait_for_selector("main"); hydrated(tab)   # both tabs hydrated before the click (no extra observer: HTTP/1.1 allows only 6 connections per origin)
    n1.wait_for_timeout(800)
    n1.get_by_role("button", name="Mark all read").click()
    R.check("tab 1 bell -> 0", wait_bell(n1, 0))
    R.check("tab 2 (untouched) synced: bell -> 0 without reload", wait_bell(n2, 0, 10000), f"bell={bell(n2)}")
    gone = False
    for _ in range(40):
        if n2.get_by_role("button", name="Mark all read").count() == 0: gone = True; break
        time.sleep(0.2)
    R.check("tab 2 notification LIST re-fetched (Mark-all-read button gone) without reload", gone)
    # new message -> both tabs update, only ONE DB notification (Phase 10 dedup)
    send_via_ui(doctor, "Second reply for multi-tab #3")
    R.check("tab 1 bell -> 1 on new message", wait_bell(n1, 1))
    R.check("tab 2 bell -> 1 on new message", wait_bell(n2, 1))
    pid = sql(f"select id from users where email='{USERS['patientA']}'")
    R.check("Phase 10 dedup intact: exactly 1 unread NEW_MESSAGE row for the patient", sql(f"select count(*) from notifications where type='NEW_MESSAGE' and read_at is null and user_id='{pid}'") == "1")

    # ---- 39: rapid burst (both parties sending concurrently, as fast as the UI allows) ----
    reqs = []
    patient.on("request", lambda r: reqs.append(r.url) if "_serverFn" in r.url else None)
    before = int(sql(f"select count(*) from messages where conversation_id='{A}'"))

    def rapid(page, prefix, n):
        for i in range(n):
            box = page.get_by_label("Message", exact=True)
            box.fill(f"{prefix}-{i}"); box.press("Enter")
            # wait until the send finished (composer cleared) - the existing UI ignores input while sending
            page.wait_for_function("() => { const t = document.querySelector('textarea'); return t && t.value === ''; }", timeout=8000)

    import threading
    # sync Playwright objects are not thread-safe; interleave instead: alternate quickly
    for i in range(6):
        for page, prefix in ((doctor, "dburst"), (patient, "pburst")):
            box = page.get_by_label("Message", exact=True)
            box.fill(f"{prefix}-{i}"); box.press("Enter")
        doctor.wait_for_function("() => document.querySelector('textarea')?.value === ''", timeout=8000)
        patient.wait_for_function("() => document.querySelector('textarea')?.value === ''", timeout=8000)
    for page in (doctor, patient):
        for prefix in ("dburst", "pburst"):
            for i in range(6):
                expect(page.get_by_text(f"{prefix}-{i}", exact=True)).to_be_visible(timeout=10000)
    time.sleep(1.5)
    after = int(sql(f"select count(*) from messages where conversation_id='{A}'"))
    R.check("burst: exactly 12 new DB rows, each stored once", after - before == 12, f"{before}->{after}")
    dbrows = sql(f"select body from messages where conversation_id='{A}' and body ~ '^[dp]burst-' order by created_at, id").split("\n")
    for who, page in (("doctor", doctor), ("patient", patient)):
        ui = [t for t in page.locator("p.whitespace-pre-wrap").all_inner_texts() if "burst-" in t]
        R.check(f"burst: {who} UI order == DB order", ui == dbrows, f"db={dbrows[:4]}.. ui={ui[:4]}..")
        R.check(f"burst: {who} UI has no duplicate rows", len(ui) == len(set(ui)) == 12, f"{len(ui)} rows")
    patient.wait_for_timeout(500)  # pump pending request events before counting
    R.check("burst: patient made a bounded number of server-fn requests (no storm)", len(reqs) <= 60, f"{len(reqs)} requests for 12 msgs")
    patient.wait_for_timeout(3000); quiet = len(reqs); patient.wait_for_timeout(5000)
    R.check("burst: no request loop after settling (0 new requests in 5s)", len(reqs) == quiet, f"{quiet}->{len(reqs)}")
    R.check("burst: still exactly 1 unread NEW_MESSAGE notification per user", sql("select count(*) from (select user_id from notifications where type='NEW_MESSAGE' and read_at is null group by user_id having count(*) > 1) t") == "0")
    browser.close()
R.finish()
