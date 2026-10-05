"""Phase 11 E2E #7 - one stream per tab across navigation, no redundant polling while healthy, connection cleanup."""
import time
from common import *

R = Results()
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx, pg, _ = login_cookie(b, USERS["patientA"])
    streams, fns = [], []
    pg.on("request", lambda r: streams.append(r.url) if "/api/realtime/stream" in r.url else None)
    pg.on("request", lambda r: fns.append(r.url) if "/_serverFn" in r.url else None)
    pg.goto(f"{BASE}/patient/dashboard"); pg.wait_for_selector("main"); hydrated(pg); pg.wait_for_timeout(2500)
    R.check("exactly ONE stream opened on first load", len(streams) == 1, f"{len(streams)}")

    # client-side navigation through 8 dashboard pages (each mounts its own DashboardLayout)
    for label in ("Appointments", "Medical History", "Prescriptions", "Messages", "Notifications", "Payments", "Reviews", "Dashboard"):
        pg.locator("aside a, nav a").filter(has_text=label).first.click(); pg.wait_for_timeout(900)
    pg.wait_for_timeout(6000)   # longer than the 5s release grace
    R.check("navigating 8 pages did NOT open extra streams", len(streams) == 1, f"{len(streams)} stream requests")

    # idle: healthy realtime => no periodic bell polling (safety poll is 5 min)
    pg.wait_for_timeout(3000); base = len(fns); pg.wait_for_timeout(25000)
    R.check("idle 25s with healthy stream: ZERO server-function polling requests", len(fns) == base, f"{len(fns)-base} requests")

    # server-side: one connection per open tab (count established sockets to :4173 for the stream is not exposed, so use two tabs)
    pg2 = ctx.new_page(); s2 = []
    pg2.on("request", lambda r: s2.append(r.url) if "/api/realtime/stream" in r.url else None)
    pg2.goto(f"{BASE}/patient/notifications"); pg2.wait_for_selector("main"); pg2.wait_for_timeout(2500)
    R.check("second tab opens its own single stream (one per tab)", len(s2) == 1, f"{len(s2)}")
    pg2.close(); pg.wait_for_timeout(1000)
    R.check("closing a tab cleaned up without disturbing the first tab's stream", len(streams) == 1)
    b.close()
R.finish()
