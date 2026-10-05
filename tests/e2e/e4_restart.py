"""Phase 11 E2E #4 - server restart: in-memory hub resets, PostgreSQL keeps everything, clients reconnect and resync."""
import subprocess, time
from common import *

R = Results()
A = CONV["convA"]
sql(f"delete from messages where conversation_id='{A}'"); sql("delete from notifications")
srv = server_ctl

with sync_playwright() as p:
    b = p.chromium.launch()
    pc, pa, _ = login_cookie(b, USERS["patientA"]); dc, da, _ = login_cookie(b, USERS["doctorA"])
    pa.goto(f"{BASE}/patient/messages/{A}"); pa.wait_for_selector("main"); hydrated(pa)
    da.goto(f"{BASE}/doctor/messages/{A}"); da.wait_for_selector("main"); hydrated(da); time.sleep(2)
    pa.evaluate("window.__marker='same-page'")
    send_via_ui(da, "before-restart"); expect(pa.locator("p.whitespace-pre-wrap", has_text="before-restart").first).to_be_visible(timeout=10000)
    R.check("live delivery works before restart", True)
    before = sql("select count(*) from messages") ; notifs_before = sql("select count(*) from notifications")

    print("stopping server:", srv("stop"))
    time.sleep(3)
    did = sql(f"select id from users where email='{USERS['doctorA']}'")
    sql(f"insert into messages (conversation_id, sender_id, body) values ('{A}', '{did}', 'stored-while-server-down')")
    ind = pa.locator('[data-testid="realtime-reconnecting"]')
    try: ind.wait_for(state="visible", timeout=30000); shown = True
    except Exception: shown = False
    R.check("clients show truthful 'reconnecting' while the server is down", shown)
    R.check("page did not crash while server was down", pa.locator("main").count() == 1)

    print("starting server:", srv("start"))
    t0 = time.time()
    try:
        expect(pa.locator("p.whitespace-pre-wrap", has_text="stored-while-server-down").first).to_be_visible(timeout=90000); took = round(time.time() - t0, 1)
    except Exception: took = None
    R.check("after restart the client reconnects and resync shows the message stored while down", took is not None, f"{took}s after server start")
    R.check("no page reload was needed", pa.evaluate("window.__marker") == "same-page")
    R.check("earlier message still there exactly once (PostgreSQL is the source of truth)", pa.locator("p.whitespace-pre-wrap", has_text="before-restart").count() == 1)
    R.check("notifications persisted across restart", int(sql("select count(*) from notifications")) >= int(notifs_before))
    R.check("message rows intact (+1 from the direct insert)", sql("select count(*) from messages") == str(int(before) + 1))
    # Poll: the indicator flips a moment AFTER the resynced message renders; it must still clear, just not instantly.
    try: expect(ind).to_be_hidden(timeout=15000); cleared = True
    except Exception: cleared = False
    R.check("indicator cleared after reconnect", cleared)

    send_via_ui(da, "after-restart")
    try: expect(pa.locator("p.whitespace-pre-wrap", has_text="after-restart").first).to_be_visible(timeout=15000); live = True
    except Exception: live = False
    R.check("live delivery works again on the fresh hub after restart", live)
    R.check("no duplicates after restart", sql(f"select count(*) from messages where conversation_id='{A}'") == "3" and pa.locator("p.whitespace-pre-wrap").count() == 3)
    b.close()
R.finish()
