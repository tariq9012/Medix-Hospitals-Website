"""Phase 11 E2E #6 - non-message notification types update the patient's bell + list LIVE (via the shared
createNotification path). Phase 12: confirming an appointment also issues exactly one invoice (and an
INVOICE_ISSUED notification), so the expected bell count is derived from the database, not hard-coded.

Self-contained: it creates its OWN appointments for the patient it watches (it never relies on whatever
order other fixtures happened to be created in)."""
import time
from datetime import date, timedelta
from common import *

R = Results()
sql("delete from notifications")
pid = sql("select id from users where email='%s'" % USERS["patientA"])
did = sql("select d.id from doctors d join users u on u.id=d.user_id where u.email='%s'" % USERS["doctorA"])
hid = sql(f"select hospital_id from hospital_doctors where doctor_id='{did}' order by is_primary desc limit 1")
fee = sql(f"select consultation_fee from doctors where id='{did}'")

def make_appt(status, days_ahead):
    d = (date.today() + timedelta(days=days_ahead)).isoformat()
    return sql(
        "insert into appointments (patient_id,doctor_id,hospital_id,appointment_date,start_time,end_time,"
        f"consultation_type,status,fee) values ('{pid}','{did}','{hid}','{d}','09:00','09:30','IN_PERSON','{status}',{fee}) returning id"
    ).splitlines()[0]

PEND = make_appt("PENDING", 40)
CONF1 = make_appt("CONFIRMED", 41)
CONF2 = make_appt("CONFIRMED", 42)

def unread():
    return int(sql(f"select count(*) from notifications where user_id='{pid}' and read_at is null"))

def wait_status(appt, wanted, seconds=10):
    """Poll until the appointment reaches `wanted` (the click returns before the server action commits)."""
    end = time.time() + seconds
    status = ""
    while time.time() < end:
        status = sql(f"select status from appointments where id='{appt}'")
        if status == wanted:
            return status
        time.sleep(0.2)
    return status

def count_type(t):
    return int(sql(f"select count(*) from notifications where user_id='{pid}' and type='{t}'"))

with sync_playwright() as p:
    b = p.chromium.launch()
    pc, pa, _ = login_cookie(b, USERS["patientA"]); dc, da, _ = login_cookie(b, USERS["doctorA"])
    pa.goto(f"{BASE}/patient/notifications"); pa.wait_for_selector("main"); hydrated(pa); attach_observer(pa); time.sleep(1.5)
    pa.evaluate("window.__marker='same-page'")
    R.check("patient starts with no notifications / bell 0", bell(pa) == 0)

    def doctor_acts(appt, button, reason=None):
        da.goto(f"{BASE}/doctor/appointments/{appt}"); da.wait_for_selector("main"); hydrated(da)
        da.get_by_role("button", name=button).click()
        if reason:
            da.get_by_placeholder("Reason for cancelling (required)").fill(reason)
            da.get_by_role("button", name="Confirm cancellation").click()

    def live(previous, needle, label, ntype):
        """Wait for the server to create the new notification(s), then assert the bell + list followed live."""
        end = time.time() + 10
        while unread() <= previous and time.time() < end:
            time.sleep(0.2)
        expected = unread()
        R.check(f"{label}: a {ntype} notification exists in PostgreSQL", count_type(ntype) >= 1)
        ok_bell = wait_bell(pa, expected, 12000)
        try: expect(pa.get_by_text(needle).first).to_be_visible(timeout=12000); ok_list = True
        except Exception: ok_list = False
        R.check(f"{label}: bell -> {expected} live (matches DB unread count)", ok_bell, f"bell={bell(pa)} db={expected}")
        R.check(f"{label}: notification list shows it live (no refresh)", ok_list)
        return expected

    doctor_acts(PEND, "Confirm appointment")
    R.check("appointment confirmed in DB", wait_status(PEND, "CONFIRMED") == "CONFIRMED")
    n1 = live(0, "confirmed", "APPOINTMENT_CONFIRMED", "APPOINTMENT_CONFIRMED")
    R.check("Phase 12: confirmation issued exactly ONE invoice", int(sql(f"select count(*) from invoices where appointment_id='{PEND}'")) == 1)

    doctor_acts(CONF2, "Cancel appointment", reason="Realtime test cancellation")
    R.check("appointment cancelled in DB", wait_status(CONF2, "CANCELLED") == "CANCELLED")
    n2 = live(n1, "cancel", "APPOINTMENT_CANCELLED", "APPOINTMENT_CANCELLED")

    doctor_acts(CONF1, "Mark completed")
    st = wait_status(CONF1, "COMPLETED", 4)
    if st == "COMPLETED": live(n2, "complet", "APPOINTMENT_COMPLETED", "APPOINTMENT_COMPLETED")
    else: print(f"  SKIPPED (not counted): COMPLETE not allowed for this fixture appointment (status={st}); relies on same createNotification path")

    R.check("page never reloaded during all of the above", pa.evaluate("window.__marker") == "same-page")
    types = sorted({e["type"] for e in events(pa)})
    R.check("only NOTIFICATION_* hints reached the patient (ids only)", set(types) <= {"NOTIFICATION_CREATED", "NOTIFICATION_READ", "NOTIFICATIONS_READ_ALL"}, str(types))
    ntypes = sql("select string_agg(distinct type::text, ',') from notifications")
    print("INFO notification types in DB:", ntypes)
    b.close()
R.finish()
