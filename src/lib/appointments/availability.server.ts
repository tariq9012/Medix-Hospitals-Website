import "@tanstack/react-start/server-only";

import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { appointments, doctorAvailability } from "@/db/schema";
import type { ConsultationType } from "@/lib/validation/enums";

import type { AvailableSlot } from "./types";

const DAY_NAMES = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
] as const;

/**
 * `date` is a plain "YYYY-MM-DD" string interpreted as the doctor/clinic's
 * own local calendar date (see the timezone note in `./types.ts`) — never
 * parsed through a UTC-aware `Date` in a way that could shift the day.
 */
function dayOfWeekFor(date: string): (typeof DAY_NAMES)[number] {
  const [year, month, day] = date.split("-").map(Number);
  // Noon avoids any DST/UTC-boundary edge case shifting the calendar date.
  const d = new Date(year!, (month ?? 1) - 1, day, 12, 0, 0);
  return DAY_NAMES[d.getDay()]!;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

/** "Now" in the same local wall-clock convention as stored appointment times. */
function nowAsLocalDateAndMinutes(): { date: string; minutes: number } {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
  return { date, minutes: now.getHours() * 60 + now.getMinutes() };
}

/**
 * Generates every candidate slot for a doctor on a given date from their
 * weekly availability rules, then marks each as available/unavailable based
 * on existing (non-cancelled) appointments and whether it's already in the
 * past. This is the single source of truth for what can be booked — the
 * booking action re-runs the same logic server-side rather than trusting
 * whatever the client last rendered.
 */
export async function generateSlotsForDate(params: {
  doctorId: string;
  date: string;
  hospitalId?: string;
  consultationType?: ConsultationType;
}): Promise<AvailableSlot[]> {
  const dayOfWeek = dayOfWeekFor(params.date);

  const rules = await db
    .select()
    .from(doctorAvailability)
    .where(
      and(
        eq(doctorAvailability.doctorId, params.doctorId),
        eq(doctorAvailability.dayOfWeek, dayOfWeek),
        eq(doctorAvailability.isActive, true),
        ...(params.hospitalId ? [eq(doctorAvailability.hospitalId, params.hospitalId)] : []),
        ...(params.consultationType
          ? [eq(doctorAvailability.consultationType, params.consultationType)]
          : []),
      ),
    );

  if (rules.length === 0) return [];

  const existingAppointments = await db
    .select({ startTime: appointments.startTime })
    .from(appointments)
    .where(
      and(
        eq(appointments.doctorId, params.doctorId),
        eq(appointments.appointmentDate, params.date),
        ne(appointments.status, "CANCELLED"),
      ),
    );
  const takenStartTimes = new Set(existingAppointments.map((a) => a.startTime.slice(0, 5)));

  const { date: today, minutes: nowMinutes } = nowAsLocalDateAndMinutes();
  const isToday = params.date === today;

  const slots: AvailableSlot[] = [];
  const seenStartTimes = new Set<string>();

  for (const rule of rules) {
    const start = timeToMinutes(rule.startTime.slice(0, 5));
    const end = timeToMinutes(rule.endTime.slice(0, 5));
    const breakStart = rule.breakStartTime ? timeToMinutes(rule.breakStartTime.slice(0, 5)) : null;
    const breakEnd = rule.breakEndTime ? timeToMinutes(rule.breakEndTime.slice(0, 5)) : null;
    const duration = rule.slotDurationMinutes;

    for (let slotStart = start; slotStart + duration <= end; slotStart += duration) {
      const slotEnd = slotStart + duration;
      const startTime = minutesToTime(slotStart);

      if (seenStartTimes.has(startTime)) continue; // overlapping rules can't double-list a time
      seenStartTimes.add(startTime);

      const inBreak =
        breakStart !== null && breakEnd !== null && slotStart < breakEnd && slotEnd > breakStart;
      const inPast = isToday && slotStart <= nowMinutes;
      const taken = takenStartTimes.has(startTime);

      slots.push({
        startTime,
        endTime: minutesToTime(slotEnd),
        available: !inBreak && !inPast && !taken,
      });
    }
  }

  return slots.sort((a, b) => (a.startTime < b.startTime ? -1 : 1));
}

/** The slot duration in minutes for a specific doctor/day/hospital/type — used to derive `endTime` at booking time. */
export async function findMatchingAvailabilityRule(params: {
  doctorId: string;
  date: string;
  hospitalId?: string;
  consultationType: ConsultationType;
  startTime: string;
}) {
  const dayOfWeek = dayOfWeekFor(params.date);
  const rules = await db
    .select()
    .from(doctorAvailability)
    .where(
      and(
        eq(doctorAvailability.doctorId, params.doctorId),
        eq(doctorAvailability.dayOfWeek, dayOfWeek),
        eq(doctorAvailability.isActive, true),
        eq(doctorAvailability.consultationType, params.consultationType),
        ...(params.hospitalId ? [eq(doctorAvailability.hospitalId, params.hospitalId)] : []),
      ),
    );

  const requestedStart = timeToMinutes(params.startTime);
  return rules.find((rule) => {
    const start = timeToMinutes(rule.startTime.slice(0, 5));
    const end = timeToMinutes(rule.endTime.slice(0, 5));
    if (requestedStart < start || requestedStart + rule.slotDurationMinutes > end) return false;
    // Must align exactly to a slot boundary, not an arbitrary in-between minute.
    return (requestedStart - start) % rule.slotDurationMinutes === 0;
  });
}

export { dayOfWeekFor, timeToMinutes, minutesToTime, nowAsLocalDateAndMinutes };
