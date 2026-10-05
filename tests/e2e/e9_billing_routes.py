"""Phase 12 routing smoke test: billing list/detail routes render correctly for every role, no 4xx/5xx/error boundary."""
import re
from common import *

R = Results()
BAD = re.compile(r"(Something went wrong|Page not found|404|Internal Server Error|Unexpected Application Error)", re.I)

with sync_playwright() as p:
    browser = p.chromium.launch()

    invoice_a = sql("select id from invoices where invoice_number='MED-2026-000001'")

    checks = [
        (USERS["patientA"], "/patient/payments", "patient billing list"),
        (USERS["patientA"], f"/patient/payments/{invoice_a}", "patient billing detail"),
        (USERS["hospitalAdmin"], "/hospital/billing", "hospital billing list"),
        (USERS["hospitalAdmin"], f"/hospital/billing/{invoice_a}", "hospital billing detail"),
        (USERS["platformAdmin"], "/admin/payments", "admin billing list"),
        (USERS["platformAdmin"], f"/admin/payments/{invoice_a}", "admin billing detail"),
        (USERS["doctorA"], "/doctor/earnings", "doctor payment status"),
    ]
    for email, path, label in checks:
        ctx, page, _ = login_cookie(browser, email)
        resp = page.goto(f"{BASE}{path}")
        page.wait_for_selector("main", timeout=15000)
        txt = page.inner_text("main")
        ok = resp.status < 400 and not BAD.search(txt[:400])
        R.check(f"{label} renders ({path})", ok, f"status={resp.status}")
        ctx.close()

    # List -> detail via real client-side navigation (Phase 9 routing regression check)
    ctx, page, _ = login_cookie(browser, USERS["hospitalAdmin"])
    page.goto(f"{BASE}/hospital/billing")
    page.wait_for_selector("main")
    hydrated(page)
    page.wait_for_function("() => !document.body.innerText.includes('Loading')", timeout=10000)
    list_text = page.inner_text("main")
    page.get_by_role("link", name="Manage").first.click()
    page.wait_for_function("() => location.pathname.includes('/hospital/billing/') && location.pathname !== '/hospital/billing/'", timeout=10000)
    # The route loader's data fetch is async even after the URL/pathname changes;
    # wait for a detail-page-only element (the Summary card) before comparing content.
    page.get_by_text("Summary", exact=True).wait_for(timeout=10000)
    detail_text = page.inner_text("main")
    R.check("hospital billing: client-side list->detail renders the DETAIL route, not the list again", detail_text.strip() != list_text.strip())
    ctx.close()

    browser.close()
R.finish()
