"""Phase 11 E2E #3 - REAL connection loss (via cuttable proxy): missed message, reconnect+resync, truthful indicator, fallback polling."""
import time
from common import *
from proxy import Proxy

DIRECT, VIA = BASE, f"http://localhost:{PROXY_PORT}"
R = Results()
A = CONV["convA"]
sql(f"delete from messages where conversation_id='{A}'"); sql("delete from notifications")
proxy = Proxy(PROXY_PORT, BASE_PORT)

with sync_playwright() as p:
    b = p.chromium.launch()
    pc, pa, _ = login_cookie(b, USERS["patientA"], VIA)      # patient reaches the app THROUGH the proxy
    dc, da, _ = login_cookie(b, USERS["doctorA"], DIRECT)    # doctor talks directly
    pa.goto(f"{VIA}/patient/messages/{A}"); pa.wait_for_selector("main"); hydrated(pa)
    da.goto(f"{DIRECT}/doctor/messages/{A}"); da.wait_for_selector("main"); hydrated(da)
    time.sleep(2)
    pa.evaluate("window.__marker='same-page'")
    ind = pa.locator('[data-testid="realtime-reconnecting"]')
    R.check("connected: no 'reconnecting' indicator", ind.count() == 0)

    # ---- 1. genuine connection loss ----
    proxy.set_down(True)
    t0 = time.time()
    try: ind.wait_for(state="visible", timeout=30000); noticed = round(time.time() - t0, 1)
    except Exception: noticed = None
    R.check("dropped connection detected; truthful 'reconnecting' indicator shown", noticed is not None, f"after {noticed}s")
    send_via_ui(da, "sent-while-patient-offline")
    R.check("message safely stored in PostgreSQL while patient is disconnected", sql("select count(*) from messages where body='sent-while-patient-offline'") == "1")
    time.sleep(1.5)
    R.check("disconnected patient does NOT show it (no fake delivery)", pa.locator("p.whitespace-pre-wrap", has_text="sent-while-patient-offline").count() == 0)
    R.check("app did not crash: page still rendered", pa.locator("main").count() == 1)

    # ---- 2. reconnect -> resync from PostgreSQL ----
    proxy.set_down(False); t1 = time.time()
    try:
        expect(pa.locator("p.whitespace-pre-wrap", has_text="sent-while-patient-offline").first).to_be_visible(timeout=60000); got = round(time.time() - t1, 1)
    except Exception: got = None
    R.check("after reconnect the missed message appears (resync), no reload", got is not None, f"after {got}s")
    R.check("page never reloaded", pa.evaluate("window.__marker") == "same-page")
    R.check("exactly one rendered copy of it", pa.locator("p.whitespace-pre-wrap", has_text="sent-while-patient-offline").count() == 1)
    R.check("indicator gone after reconnect", not ind.is_visible())
    R.check("bell caught up after reconnect", wait_bell(pa, 1, 15000), f"bell={bell(pa)}")
    send_via_ui(da, "live-again-after-reconnect")
    expect(pa.locator("p.whitespace-pre-wrap", has_text="live-again-after-reconnect").first).to_be_visible(timeout=10000)
    R.check("live delivery resumes after reconnect", pa.locator("p.whitespace-pre-wrap", has_text="live-again-after-reconnect").count() == 1)
    R.check("no duplicate DB rows", sql(f"select count(*) from messages where conversation_id='{A}'") == "2")

    # ---- 3. sending still works while the live stream is unavailable ----
    pc.route("**/api/realtime/stream*", lambda r: r.abort())   # new stream attempts fail...
    proxy.kill_all()                                            # ...and the live one is cut; normal requests still flow
    try: ind.wait_for(state="visible", timeout=30000)
    except Exception: pass
    send_via_ui(pa, "patient-send-without-realtime")
    R.check("stream unavailable: patient can still SEND (server functions unaffected)", sql("select count(*) from messages where body='patient-send-without-realtime'") == "1")

    # ---- 4. fallback polling for the bell ----
    sql("delete from notifications")
    pa.evaluate("1")
    wait_bell(pa, 0, 60000)
    send_via_ui(da, "poll-fallback")
    t2 = time.time(); ok = wait_bell(pa, 1, 75000)
    R.check("stream unavailable: bell still updates via low-frequency fallback poll", ok, f"after {round(time.time()-t2,1)}s")
    pc.unroute("**/api/realtime/stream*")
    try: expect(pa.locator("p.whitespace-pre-wrap", has_text="poll-fallback").first).to_be_visible(timeout=60000); ok2 = True
    except Exception: ok2 = False
    R.check("once the stream is allowed again, conversation resyncs the message sent meanwhile", ok2)
    b.close()
R.finish()
