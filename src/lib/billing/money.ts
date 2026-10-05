/**
 * Money handling for Phase 12 billing.
 *
 * DECISION (documented per Phase 12 spec §3/§40): the existing schema
 * already represents money as `numeric(10,2)` decimal strings —
 * `appointments.fee` and `payments.amount` predate this phase and are read
 * by existing UI. Silently switching those columns to integer minor units
 * would require a data migration and would not match the still-decimal
 * `doctors.consultationFee` they're snapshotted from. Rather than risk that,
 * Phase 12 keeps `numeric(10,2)` as the on-disk/DB representation for all
 * new billing columns (invoices, payments, refunds) — consistent with the
 * rest of the schema — but NEVER does arithmetic in floating point: every
 * amount is converted to integer minor units (paisa/cents) for addition,
 * comparison and validation, and only formatted back to a decimal string
 * for storage/display. This satisfies "never use floating-point for money"
 * without a schema/data migration of pre-existing fee history.
 *
 * Client-safe (no server-only imports) so components can format amounts.
 */

export const DEFAULT_CURRENCY = "PKR";

/** Parses a `numeric(10,2)` string (as returned by postgres-js/drizzle) into integer minor units. Throws on garbage input — money must never silently become 0. */
export function toMinorUnits(amount: string | number): number {
  const str = typeof amount === "number" ? amount.toFixed(2) : amount.trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(str)) {
    throw new Error(`Invalid money amount: ${JSON.stringify(amount)}`);
  }
  const [wholePart, fractionPart = ""] = str.split(".");
  const sign = wholePart.startsWith("-") ? -1 : 1;
  const whole = Math.abs(Number(wholePart));
  const fraction = Number(fractionPart.padEnd(2, "0"));
  return sign * (whole * 100 + fraction);
}

/** Formats integer minor units back into the `numeric(10,2)`-compatible decimal string used for storage. */
export function fromMinorUnits(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(minor));
  const whole = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, "0");
  return `${sign}${whole}.${fraction}`;
}

export function addMoney(a: string, b: string): string {
  return fromMinorUnits(toMinorUnits(a) + toMinorUnits(b));
}

export function subtractMoney(a: string, b: string): string {
  return fromMinorUnits(toMinorUnits(a) - toMinorUnits(b));
}

export function isPositiveAmount(amount: string): boolean {
  try {
    return toMinorUnits(amount) > 0;
  } catch {
    return false;
  }
}

export function compareMoney(a: string, b: string): number {
  return toMinorUnits(a) - toMinorUnits(b);
}

const CURRENCY_LOCALE: Record<string, string> = { PKR: "en-PK", USD: "en-US" };

/** Display formatting only — never used for storage or arithmetic. */
export function formatMoney(amount: string | number, currency: string = DEFAULT_CURRENCY): string {
  const minor = toMinorUnits(amount);
  const value = minor / 100;
  try {
    return new Intl.NumberFormat(CURRENCY_LOCALE[currency] ?? "en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(value);
  } catch {
    // Unknown currency code passed to Intl — fall back to a plain label rather than throwing in the UI.
    return `${currency} ${value.toFixed(2)}`;
  }
}
