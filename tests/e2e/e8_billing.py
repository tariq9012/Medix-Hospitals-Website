"""Phase 12 E2E - cross-role billing flow (patient/hospital/doctor/admin), security, realtime regression."""
import time
from common import *

R = Results()
INVOICE_A = sql("select id from invoices where invoice_number='MED-2026-000001'")  # seeded: ISSUED, tariq.khan / dr.ahmed.raza / hospitalOne
assert INVOICE_A, "seed did not create invoice MED-2026-000001"

with sync_playwright() as p:
    browser = p.chromium.launch()

    # ---- 1. Patient sees the invoice, read-only, no self-pay controls ----
    pc, patient, _ = login_cookie(browser, USERS["patientA"])
    patient.goto(f"{BASE}/patient/payments/{INVOICE_A}")
    patient.wait_for_selector("main")
    body = patient.inner_text("body")
    R.check("patient invoice page shows the invoice number", "MED-2026-000001" in body)
    R.check("patient page has NO 'Record payment' control", patient.get_by_role("button", name="Record payment").count() == 0)
    R.check("patient page has NO 'Record refund' control", patient.get_by_role("button", name="Record refund").count() == 0)
    R.check("no fake card form / card number field on the page", patient.locator('input[placeholder*="card" i], input[name*="card" i]').count() == 0)

    # ---- 2. Cross-patient: another patient cannot view Patient A's invoice ----
    pc2, patientB, _ = login_cookie(browser, USERS["patientB"])
    resp = patientB.goto(f"{BASE}/patient/payments/{INVOICE_A}")
    patientB.wait_for_selector("main")
    R.check("Patient B cannot see Patient A's invoice (not-found, no leak)", "MED-2026-000001" not in patientB.inner_text("body"))

    # ---- 3. Doctor sees only read-only payment STATUS, no amounts-collected controls ----
    dc, doctor, _ = login_cookie(browser, USERS["doctorA"])
    doctor.goto(f"{BASE}/doctor/earnings")
    doctor.wait_for_selector("main")
    doctor.wait_for_function("() => !document.body.innerText.includes('Loading')", timeout=10000)
    doc_body = doctor.inner_text("body")
    R.check("doctor sees the invoice's payment status", "MED-2026-000001" in doc_body)
    R.check("doctor page has no record-payment control", doctor.get_by_role("button", name="Record payment").count() == 0)
    R.check("doctor page explicitly disclaims payouts", "payout" in doc_body.lower())

    # ---- 4. Hospital A admin CAN see and act on it ----
    hc, hospital, _ = login_cookie(browser, USERS["hospitalAdmin"])
    hospital.goto(f"{BASE}/hospital/billing/{INVOICE_A}")
    hospital.wait_for_selector("main")
    hydrated(hospital)
    R.check("hospital admin sees the invoice", "MED-2026-000001" in hospital.inner_text("body"))

    # Patient tab stays open with a live SSE connection (Phase 11) while the payment is recorded.
    patient.goto(f"{BASE}/patient/payments/{INVOICE_A}")
    patient.wait_for_selector("main")
    hydrated(patient)
    attach_observer(patient)
    time.sleep(1.5)
    bell_before = bell(patient)

    hospital.get_by_role("button", name="Record payment").click()
    dialog = hospital.get_by_role("dialog")
    dialog.wait_for(state="visible")
    dialog.locator("#payment-amount").fill("3000")
    dialog.get_by_role("button", name="Record payment").click()
    dialog.wait_for(state="hidden", timeout=10000)
    R.check("hospital admin recorded the payment (dialog closed = success toast)", True)
    R.check("invoice status now PAID in DB", sql(f"select status from invoices where id='{INVOICE_A}'") == "PAID")

    # ---- 5. Phase 11 regression: patient's ALREADY-OPEN invoice page updates live, no refresh ----
    patient.evaluate("window.__marker = 'no-reload'")
    try:
        patient.wait_for_function("() => document.body.innerText.includes('Paid')", timeout=10000)
        live_ok = True
    except Exception:
        live_ok = False
    R.check("patient's open invoice page updates to PAID via realtime, without a reload", live_ok)
    bell_ok = False
    for _ in range(40):
        if bell(patient) > bell_before:
            bell_ok = True
            break
        time.sleep(0.2)
    R.check("patient's bell also updated", bell_ok, f"before={bell_before} after={bell(patient)}")
    R.check("patient tab was never reloaded", patient.evaluate("window.__marker") == "no-reload")
    evs = events(patient)
    R.check("realtime payload for the payment carried no amount/clinical text, only ids", not any("3000" in str(e) for e in evs))

    # ---- 6. Refund workflow, still on the same invoice ----
    hospital.reload()
    hospital.wait_for_selector("main")
    hydrated(hospital)
    hospital.get_by_role("button", name="Record refund").click()
    rdialog = hospital.get_by_role("dialog")
    rdialog.wait_for(state="visible")
    rdialog.locator("#refund-amount").fill("500")
    rdialog.locator("#refund-reason").fill("E2E test refund")
    rdialog.get_by_role("button", name="Record refund").click()
    rdialog.wait_for(state="hidden", timeout=10000)
    R.check(
        "refund recorded, invoice now PARTIALLY_REFUNDED",
        sql(f"select status from invoices where id='{INVOICE_A}'") == "PARTIALLY_REFUNDED",
    )
    R.check(
        "amountRefunded never exceeds amountPaid",
        float(sql(f"select amount_refunded from invoices where id='{INVOICE_A}'"))
        <= float(sql(f"select amount_paid from invoices where id='{INVOICE_A}'")),
    )

    # ---- 7. Platform admin oversight is read-only for this (hospital-owned) invoice ----
    ac, admin, _ = login_cookie(browser, USERS["platformAdmin"])
    admin.goto(f"{BASE}/admin/payments/{INVOICE_A}")
    admin.wait_for_selector("main")
    R.check("admin oversight page shows the invoice", "MED-2026-000001" in admin.inner_text("body"))
    R.check(
        "admin has NO record-payment control for a hospital-owned invoice",
        admin.get_by_role("button", name="Record payment").count() == 0,
    )
    R.check(
        "admin page discloses it's read-only for hospital invoices",
        "hospital admin manages" in admin.inner_text("body").lower(),
    )

    browser.close()
R.finish()
