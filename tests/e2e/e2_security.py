# E2E-SERVER-ENV: REALTIME_SESSION_RECHECK_MS=3000
"""Phase 11 E2E #2 - recipient scoping, authentication, logout, expiry, revocation."""
import json, time
from common import *

R = Results()
A, B = CONV["convA"], CONV["convB"]
sql("delete from messages where conversation_id in ('%s','%s')" % (A, B)); sql("delete from notifications")

with sync_playwright() as p:
    browser = p.chromium.launch()
    actors = {}
    for name in USERS:
        ctx, page, token = login_cookie(browser, USERS[name])
        actors[name] = dict(ctx=ctx, page=page, token=token)
    urls = {"patientA": f"/patient/messages/{A}", "doctorA": f"/doctor/messages/{A}",
            "patientB": f"/patient/messages/{B}", "doctorB": f"/doctor/messages/{B}",
            "hospitalAdmin": "/", "platformAdmin": "/"}
    for name, a in actors.items():
        a["page"].goto(BASE + urls[name]); a["page"].wait_for_selector("body")
        attach_observer(a["page"])
    time.sleep(1.5)

    # --- traffic on BOTH conversations, mixed, plus notification reads ---
    for i in range(3):
        send_via_ui(actors["patientA"]["page"], f"A-patient-{i}")
        send_via_ui(actors["doctorB"]["page"], f"B-doctor-{i}")
        send_via_ui(actors["doctorA"]["page"], f"A-doctor-{i}")
        send_via_ui(actors["patientB"]["page"], f"B-patient-{i}")
    n = actors["patientB"]["ctx"].new_page(); n.goto(BASE + "/patient/notifications"); n.wait_for_selector("main"); hydrated(n)
    pbid = sql(f"select id from users where email='{USERS['patientB']}'")
    unread_before = sql(f"select count(*) from notifications where user_id='{pbid}' and read_at is null")
    n.get_by_role("button", name="Mark all read").click()
    time.sleep(1); R.check("patientB mark-all-read really updated PostgreSQL", unread_before != "0" and sql(f"select count(*) from notifications where user_id='{pbid}' and read_at is null") == "0", f"unread {unread_before}->0")
    time.sleep(2.5)

    ev = {k: events(v["page"]) for k, v in actors.items()}
    idsA = set(sql(f"select id from messages where conversation_id='{A}'").split("\n"))
    idsB = set(sql(f"select id from messages where conversation_id='{B}'").split("\n"))
    nidsB = set(sql(f"select id from notifications where user_id in (select id from users where email in ('{USERS['patientB']}','{USERS['doctorB']}'))").split("\n"))
    nidsA = set(sql(f"select id from notifications where user_id in (select id from users where email in ('{USERS['patientA']}','{USERS['doctorA']}'))").split("\n"))
    def refs(events_, key): return {e.get(key) for e in events_ if e.get(key)}
    for who, mine, other_msgs, other_notifs, other_conv in (
        ("patientA", A, idsB, nidsB, B), ("doctorA", A, idsB, nidsB, B),
        ("patientB", B, idsA, nidsA, A), ("doctorB", B, idsA, nidsA, A)):
        e = ev[who]
        R.check(f"{who}: received events (sanity)", len(e) > 0, f"{len(e)} events")
        R.check(f"{who}: ZERO events referencing the other pair's conversation", other_conv not in refs(e, "conversationId"))
        R.check(f"{who}: ZERO events referencing the other pair's messages", not (refs(e, "messageId") & other_msgs))
        R.check(f"{who}: ZERO events referencing the other pair's notifications", not (refs(e, "notificationId") & other_notifs))
        R.check(f"{who}: every conversation event is for its own conversation", refs(e, "conversationId") <= {mine})
    R.check("Hospital Admin: ZERO realtime events of any kind", len(ev["hospitalAdmin"]) == 0, str(ev["hospitalAdmin"][:2]))
    R.check("Platform Admin: ZERO realtime events of any kind", len(ev["platformAdmin"]) == 0, str(ev["platformAdmin"][:2]))
    R.check("admin streams are connected (so 'zero' is meaningful)", all("ready" in actors[k]["page"].evaluate("window.__obsStates") for k in ("hospitalAdmin", "platformAdmin")))
    print("DEBUG READ_ALL by actor:", {k: [e["type"] for e in v if "READ" in e["type"]] for k, v in ev.items()})
    print("DEBUG patientB unread before click was:", "n/a")
    R.check("patientB NOTIFICATION_READ_ALL only reached patientB", any(e["type"] == "NOTIFICATIONS_READ_ALL" for e in ev["patientB"]) and not any(e["type"] == "NOTIFICATIONS_READ_ALL" for k in ("patientA", "doctorA", "doctorB", "hospitalAdmin", "platformAdmin") for e in ev[k]))

    # --- unauthorized data access after an event: read is still participant-checked ---
    # patientB tries to refresh patientA's conversation via the real server function (same call the client makes after an event)
    pb = actors["patientB"]["page"]; pb.goto(f"{BASE}/patient/messages/{A}"); time.sleep(2)
    body = pb.inner_text("body")
    R.check("patientB opening patientA's conversation sees none of its messages", "A-patient-0" not in body and "A-doctor-0" not in body)

    # --- AUTH: raw stream ---
    st, c, r = sse_open(None); R.check("no cookie -> 401", st == 401, str(st)); c.close()
    st, c, r = sse_open("garbage-token"); R.check("invalid cookie -> 401", st == 401, str(st)); c.close()
    st, c, r = sse_open(None, "/api/realtime/stream?userId=x&role=DOCTOR&patientId=y&doctorId=z"); R.check("identity query params grant nothing -> 401", st == 401, str(st)); c.close()
    tokA = actors["patientA"]["token"]
    st, c, r = sse_open(tokA, "/api/realtime/stream?userId=" + sql(f"select id from users where email='{USERS['doctorA']}'"))
    fr = sse_read_frames(r, 1.5); c.close()
    R.check("valid patient session -> 200 + ready", st == 200 and any(f[0] == "ready" for f in fr), str(st))
    st, c, r = sse_open(actors["doctorA"]["token"]); fr = sse_read_frames(r, 1.5); c.close()
    R.check("valid doctor session -> 200 + ready", st == 200 and any(f[0] == "ready" for f in fr), str(st))
    st, c, r = sse_open(tokA, headers={"Sec-Fetch-Site": "cross-site"}); R.check("cross-site request -> 403", st == 403, str(st)); c.close()

    # expired session
    exp = mint_token(USERS["patientA"]); sql("update auth_sessions set expires_at = now() - interval '1 minute' where user_id=(select id from users where email='%s') and id=(select id from auth_sessions order by created_at desc limit 1)" % USERS["patientA"])
    st, c, r = sse_open(exp); R.check("expired session -> 401", st == 401, str(st)); c.close()

    # revoked mid-stream via DB delete (simulates revocation on another instance -> bounded recheck)
    tokR = mint_token(USERS["patientA"])
    st, c, r = sse_open(tokR); fr0 = sse_read_frames(r, 1)
    sql("delete from auth_sessions where id=(select id from auth_sessions order by created_at desc limit 1)")
    t0 = time.time(); fr = sse_read_frames(r, 12); c.close()
    kinds = [f[0] for f in fr]
    took = time.time() - t0
    R.check("revoked session: stream told 'session-ended' and closed within the recheck bound (3s + margin)", "session-ended" in kinds and "__EOF__" in kinds and took <= 5.5, f"{kinds} in {took:.1f}s")

    # suspended account mid-stream (status flip, sessions NOT deleted) -> recheck must still cut it
    tokS = mint_token(USERS["patientB"])
    st, c, r = sse_open(tokS); sse_read_frames(r, 1)
    sql(f"update users set status='SUSPENDED' where email='{USERS['patientB']}'")
    fr = sse_read_frames(r, 12); c.close()
    R.check("suspended account: open stream terminated within the recheck bound", "session-ended" in [f[0] for f in fr], str([f[0] for f in fr]))
    st, c, r = sse_open(tokS); R.check("suspended account: cannot open a new stream", st == 401, str(st)); c.close()
    sql(f"update users set status='ACTIVE' where email='{USERS['patientB']}'")

    # logout via real UI: stream closed, no reconnect, old token dead
    pa = actors["patientA"]["page"]; pa.goto(BASE + "/patient/dashboard"); pa.wait_for_selector("main"); time.sleep(1.5)
    tokLogin = actors["patientA"]["token"]
    reqs = []; pa.on("request", lambda rq: reqs.append(rq.url) if "/api/realtime/stream" in rq.url else None)
    pa.get_by_text("Logout").first.click()
    pa.wait_for_function("location.pathname.startsWith('/login') || location.pathname === '/'", timeout=15000)
    pa.wait_for_timeout(8000)   # (time.sleep would NOT deliver request events)
    R.check("logout: app made NO further stream requests (no reconnect loop)", len(reqs) == 0, f"{len(reqs)} requests after logout")
    st, c, r = sse_open(tokLogin); R.check("logout: old session token rejected by stream", st == 401, str(st)); c.close()
    obs = pa.evaluate("window.__obsStates") if pa.evaluate("!!window.__obsStates") else []
    browser.close()
R.finish()
