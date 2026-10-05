import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Building2, CalendarCheck, Check, Loader2, MapPin, Video } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { PageHeader, RatingSummary } from "@/components/common";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { requireRoleBeforeLoad } from "@/lib/auth/route-guards";
import {
  bookAppointmentFn,
  getAvailableSlotsFn,
  getBookableDoctorFn,
  listBookableDoctorsFn,
} from "@/lib/appointments/functions";
import type {
  AvailableSlot,
  BookableDoctorDetail,
  BookableDoctorSummary,
} from "@/lib/appointments/types";
import { cn } from "@/lib/utils";
import type { ConsultationType } from "@/lib/validation/enums";

interface BookSearch {
  doctor?: string;
  hospital?: string;
  slot?: string;
}

export const Route = createFileRoute("/book")({
  beforeLoad: requireRoleBeforeLoad("PATIENT"),
  validateSearch: (search: Record<string, unknown>): BookSearch => ({
    doctor: typeof search["doctor"] === "string" ? search["doctor"] : undefined,
    hospital: typeof search["hospital"] === "string" ? search["hospital"] : undefined,
    slot: typeof search["slot"] === "string" ? search["slot"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Book an Appointment — Medix" },
      {
        name: "description",
        content:
          "Book a video or in-clinic appointment in a few guided steps: choose a doctor, pick a date and time, add your reason and confirm.",
      },
      { property: "og:title", content: "Book an Appointment — Medix" },
      {
        property: "og:description",
        content: "A guided booking flow for video and in-clinic appointments.",
      },
    ],
  }),
  component: BookingPage,
});

const STEPS = ["Doctor", "Date & Time", "Type", "Details", "Review", "Confirmed"];

function formatFee(fee: string | null): string {
  if (!fee) return "—";
  const n = Number(fee);
  return Number.isFinite(n) ? `PKR ${n.toLocaleString()}` : "—";
}

/** Next 14 calendar days, in the app's local wall-clock convention (see src/lib/appointments/types.ts). */
function nextDays(count: number) {
  const out: { iso: string; day: string; num: string; month: string }[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    out.push({
      iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      day: d.toLocaleDateString("en-US", { weekday: "short" }),
      num: String(d.getDate()),
      month: d.toLocaleDateString("en-US", { month: "short" }),
    });
  }
  return out;
}

function BookingPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [doctors, setDoctors] = useState<BookableDoctorSummary[] | null>(null);
  const [doctorId, setDoctorId] = useState(search.doctor ?? "");
  const [doctorDetail, setDoctorDetail] = useState<BookableDoctorDetail | null>(null);
  const [hospitalId, setHospitalId] = useState<string | undefined>(undefined);

  const dates = useMemo(() => nextDays(14), []);
  const [date, setDate] = useState(dates[0]!.iso);
  const [slots, setSlots] = useState<AvailableSlot[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slot, setSlot] = useState("");

  const [type, setType] = useState<ConsultationType>("IN_PERSON");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookedAppointmentId, setBookedAppointmentId] = useState<string | null>(null);

  // Load bookable doctors once.
  useEffect(() => {
    listBookableDoctorsFn()
      .then(setDoctors)
      .catch(() => setDoctors([]));
  }, []);

  // Load full detail (incl. affiliated hospitals) whenever the chosen doctor changes.
  useEffect(() => {
    setDoctorDetail(null);
    setHospitalId(undefined);
    if (!doctorId) return;
    getBookableDoctorFn({ data: { doctorId } })
      .then((d) => {
        setDoctorDetail(d);
        if (d && d.hospitals.length > 0) setHospitalId(d.hospitals[0]!.id);
      })
      .catch(() => setDoctorDetail(null));
  }, [doctorId]);

  // Load real slots whenever doctor/date/type/hospital changes.
  useEffect(() => {
    setSlot("");
    if (!doctorId || !date) {
      setSlots(null);
      return;
    }
    setSlotsLoading(true);
    getAvailableSlotsFn({ data: { doctorId, date, hospitalId, consultationType: type } })
      .then(setSlots)
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [doctorId, date, hospitalId, type]);

  const fee = doctorDetail?.consultationFee ?? null;

  function next() {
    const e: Record<string, string> = {};
    if (step === 0 && !doctorId) e["doctor"] = "Select a doctor to continue.";
    if (step === 1 && !slot) e["slot"] = "Select a time slot to continue.";
    if (step === 3 && reason.trim().length < 5)
      e["reason"] = "Please describe your reason in at least 5 characters.";
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  async function confirmBooking() {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const result = await bookAppointmentFn({
        data: {
          doctorId,
          hospitalId: type === "IN_PERSON" ? hospitalId : undefined,
          appointmentDate: date,
          startTime: slot,
          consultationType: type,
          reasonForVisit: reason,
          patientNotes: notes || undefined,
        },
      });
      if (!result.ok) {
        setSubmitError(result.message);
        // The slot may have just been taken — refresh availability and send
        // the patient back to pick a different time instead of retrying blindly.
        setSlotsLoading(true);
        const fresh = await getAvailableSlotsFn({
          data: { doctorId, date, hospitalId, consultationType: type },
        }).catch(() => []);
        setSlots(fresh);
        setSlotsLoading(false);
        setStep(1);
        return;
      }
      setBookedAppointmentId(result.appointmentId);
      setStep(5);
    } catch {
      setSubmitError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PublicLayout>
      <div className="container-page py-10">
        <PageHeader
          breadcrumbs={[{ label: "Home", to: "/" }, { label: "Book appointment" }]}
          title="Book an appointment"
          description="A few quick steps. Your appointment is confirmed as pending — payment isn't collected online yet."
        />

        {/* Stepper */}
        <ol className="mb-8 flex flex-wrap items-center gap-x-2 gap-y-3" aria-label="Booking steps">
          {STEPS.map((label, i) => (
            <li key={label} className="flex items-center gap-2">
              <span
                aria-current={i === step ? "step" : undefined}
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
                  i < step && "bg-success/15 text-success",
                  i === step && "bg-primary text-primary-foreground",
                  i > step && "bg-muted text-muted-foreground",
                )}
              >
                {i < step ? <Check className="size-4" aria-hidden="true" /> : i + 1}
              </span>
              <span
                className={cn(
                  "text-xs sm:text-sm",
                  i === step ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
              {i < STEPS.length - 1 && (
                <span className="hidden h-px w-6 bg-border sm:block" aria-hidden="true" />
              )}
            </li>
          ))}
        </ol>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Card>
            <CardContent className="space-y-6 p-6">
              {step === 0 && (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold">Select a doctor</h2>
                  {doctors === null ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading
                      doctors…
                    </div>
                  ) : doctors.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No doctors are currently available for booking. Please check back soon.
                    </p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {doctors.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setDoctorId(d.id)}
                          aria-pressed={doctorId === d.id}
                          className={cn(
                            "flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                            doctorId === d.id
                              ? "border-primary bg-primary-soft"
                              : "border-border hover:bg-surface",
                          )}
                        >
                          {d.profileImage ? (
                            <img
                              src={d.profileImage}
                              alt=""
                              className="size-12 rounded-lg object-cover"
                            />
                          ) : (
                            <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-primary-soft text-sm font-semibold text-primary">
                              {d.name
                                .replace("Dr. ", "")
                                .split(" ")
                                .map((w) => w[0])
                                .slice(0, 2)
                                .join("")}
                            </span>
                          )}
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{d.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {d.specialty ?? "General Medicine"} · {formatFee(d.consultationFee)}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {errors["doctor"] && (
                    <p className="text-sm text-destructive" role="alert">
                      {errors["doctor"]}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    Looking for someone else?{" "}
                    <Link to="/doctors" className="text-primary underline-offset-4 hover:underline">
                      Browse the full directory
                    </Link>
                    .
                  </p>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-5">
                  <div className="space-y-4">
                    <h2 className="text-lg font-semibold">Select a date</h2>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
                      {dates.map((d) => (
                        <button
                          key={d.iso}
                          type="button"
                          onClick={() => setDate(d.iso)}
                          aria-pressed={date === d.iso}
                          className={cn(
                            "rounded-xl border p-3 text-center transition-colors",
                            date === d.iso
                              ? "border-primary bg-primary-soft text-primary"
                              : "border-border hover:bg-surface",
                          )}
                        >
                          <span className="block text-xs text-muted-foreground">{d.day}</span>
                          <span className="block font-display text-lg font-bold">{d.num}</span>
                          <span className="block text-xs text-muted-foreground">{d.month}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {doctorDetail && doctorDetail.hospitals.length > 0 && type === "IN_PERSON" && (
                    <div className="space-y-2">
                      <Label>Location</Label>
                      <Select value={hospitalId} onValueChange={setHospitalId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a location" />
                        </SelectTrigger>
                        <SelectContent>
                          {doctorDetail.hospitals.map((h) => (
                            <SelectItem key={h.id} value={h.id}>
                              {h.name}
                              {h.city ? ` — ${h.city}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-4">
                    <h2 className="text-lg font-semibold">Select a time slot</h2>
                    {slotsLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading
                        availability…
                      </div>
                    ) : !slots || slots.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No slots are available on this date. Try another day.
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {slots.map((s) => (
                          <Button
                            key={s.startTime}
                            type="button"
                            variant={slot === s.startTime ? "default" : "outline"}
                            size="sm"
                            disabled={!s.available}
                            onClick={() => setSlot(s.startTime)}
                          >
                            {s.startTime}
                          </Button>
                        ))}
                      </div>
                    )}
                    {errors["slot"] && (
                      <p className="text-sm text-destructive" role="alert">
                        {errors["slot"]}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Greyed-out slots are already taken or in the past.
                    </p>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold">Appointment type</h2>
                  <RadioGroup
                    value={type}
                    onValueChange={(v) => setType(v as ConsultationType)}
                    className="grid gap-3 sm:grid-cols-2"
                  >
                    {[
                      {
                        v: "ONLINE" as const,
                        icon: Video,
                        title: "Video consultation",
                        text: "Join a secure video call from anywhere.",
                      },
                      {
                        v: "IN_PERSON" as const,
                        icon: MapPin,
                        title: "In-person visit",
                        text: doctorDetail?.hospitals[0]
                          ? `Visit ${doctorDetail.hospitals[0].name} at your booked time.`
                          : "Visit the clinic at your booked time.",
                      },
                    ].map((o) => (
                      <Label
                        key={o.v}
                        htmlFor={`type-${o.v}`}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-xl border p-4 font-normal transition-colors",
                          type === o.v ? "border-primary bg-primary-soft" : "border-border",
                        )}
                      >
                        <RadioGroupItem value={o.v} id={`type-${o.v}`} className="mt-1" />
                        <span>
                          <span className="flex items-center gap-2 font-medium">
                            <o.icon className="size-4 text-primary" aria-hidden="true" /> {o.title}
                          </span>
                          <span className="mt-1 block text-sm text-muted-foreground">{o.text}</span>
                        </span>
                      </Label>
                    ))}
                  </RadioGroup>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold">Reason for visit</h2>
                  <div className="space-y-2">
                    <Label htmlFor="reason">What would you like to discuss?</Label>
                    <Input
                      id="reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g. Follow-up for blood pressure"
                      aria-invalid={Boolean(errors["reason"])}
                      aria-describedby="reason-help"
                    />
                    <p id="reason-help" className="text-xs text-muted-foreground">
                      A short summary helps the doctor prepare before your appointment.
                    </p>
                    {errors["reason"] && (
                      <p className="text-sm text-destructive" role="alert">
                        {errors["reason"]}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">Symptoms or notes (optional)</Label>
                    <Textarea
                      id="notes"
                      rows={4}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Current medication, allergies, how long symptoms have lasted…"
                    />
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold">Review & confirm</h2>
                  <div className="space-y-2 rounded-xl border border-border p-4 text-sm">
                    <Row label="Doctor" value={doctorDetail?.name ?? "—"} />
                    <Row label="Date" value={date} />
                    <Row label="Time" value={slot || "—"} />
                    <Row
                      label="Type"
                      value={type === "ONLINE" ? "Video consultation" : "In-person"}
                    />
                    <Separator className="my-2" />
                    <Row label="Consultation fee" value={formatFee(fee)} strong />
                  </div>
                  {submitError && (
                    <p
                      className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                      role="alert"
                    >
                      {submitError}
                    </p>
                  )}
                  <p className="rounded-lg bg-warning/12 px-3 py-2 text-xs text-foreground">
                    Online payment isn't available yet — your appointment is booked as{" "}
                    <strong>pending</strong> and payment is settled at your visit. No charge is made
                    now.
                  </p>
                </div>
              )}

              {step === 5 && bookedAppointmentId && (
                <div className="space-y-5 text-center">
                  <span className="mx-auto grid size-14 place-items-center rounded-full bg-success/15 text-success">
                    <CalendarCheck className="size-7" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="font-display text-2xl font-bold">Appointment Requested</h2>
                    <p className="mt-1 text-muted-foreground">
                      Your appointment with {doctorDetail?.name ?? "your doctor"} is booked and
                      pending confirmation.
                    </p>
                    <p className="text-muted-foreground">
                      {new Date(date + "T00:00:00").toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}{" "}
                      — {slot}
                    </p>
                  </div>
                  <div className="mx-auto max-w-sm space-y-2 rounded-xl border border-border p-4 text-left text-sm">
                    <Row
                      label="Appointment ID"
                      value={bookedAppointmentId.slice(0, 8).toUpperCase()}
                    />
                    <Row label="Doctor" value={doctorDetail?.name ?? "—"} />
                    <Row label="Specialty" value={doctorDetail?.specialty ?? "—"} />
                    <Row
                      label="Type"
                      value={type === "ONLINE" ? "Video consultation" : "In-person"}
                    />
                    <Row label="Payment" value="Pending — settled at your visit" strong />
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button asChild>
                      <Link to="/patient/appointments">View My Appointments</Link>
                    </Button>
                  </div>
                </div>
              )}

              {step < 4 && (
                <div className="flex justify-between gap-2 border-t border-border pt-5">
                  <Button
                    variant="outline"
                    onClick={() => setStep((s) => Math.max(0, s - 1))}
                    disabled={step === 0}
                  >
                    Back
                  </Button>
                  <Button onClick={next}>Continue</Button>
                </div>
              )}

              {step === 4 && (
                <div className="flex justify-between gap-2 border-t border-border pt-5">
                  <Button variant="outline" onClick={() => setStep(3)} disabled={isSubmitting}>
                    Back
                  </Button>
                  <Button onClick={confirmBooking} disabled={isSubmitting}>
                    {isSubmitting ? "Booking…" : "Confirm booking"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <Card>
              <CardContent className="space-y-4 p-6">
                <h2 className="font-semibold">Your booking</h2>
                {doctorDetail ? (
                  <div className="flex gap-3">
                    {doctorDetail.profileImage ? (
                      <img
                        src={doctorDetail.profileImage}
                        alt=""
                        className="size-14 rounded-xl object-cover"
                      />
                    ) : (
                      <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-primary-soft text-sm font-semibold text-primary">
                        {doctorDetail.name
                          .replace("Dr. ", "")
                          .split(" ")
                          .map((w) => w[0])
                          .slice(0, 2)
                          .join("")}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium">{doctorDetail.name}</p>
                      <p className="text-sm text-primary">
                        {doctorDetail.specialty ?? "General Medicine"}
                      </p>
                      <RatingSummary
                        rating={doctorDetail.totalReviews > 0 ? Number(doctorDetail.rating) : null}
                        reviewCount={doctorDetail.totalReviews}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No doctor selected yet.</p>
                )}
                <Separator />
                <div className="space-y-2 text-sm">
                  <Row
                    label="Date"
                    value={new Date(date + "T00:00:00").toLocaleDateString("en-US", {
                      day: "numeric",
                      month: "short",
                    })}
                  />
                  <Row label="Time" value={slot || "—"} />
                  <Row label="Type" value={type === "ONLINE" ? "Video" : "In-person"} />
                  <Row label="Fee" value={formatFee(fee)} strong />
                </div>
                {doctorDetail && doctorDetail.hospitals.length > 0 && (
                  <Badge variant="secondary" className="gap-1">
                    <Building2 className="size-3" aria-hidden="true" />{" "}
                    {doctorDetail.hospitals[0]!.name}
                  </Badge>
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </PublicLayout>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("text-right", strong && "font-semibold")}>{value}</span>
    </div>
  );
}
