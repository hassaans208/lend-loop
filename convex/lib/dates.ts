/**
 * Calendar-date helpers. Loans are day ranges stored as "YYYY-MM-DD".
 * Lexicographic order of ISO dates equals chronological order, so plain string
 * comparison is correct and index-friendly.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  // Rejects impossible dates such as 2026-02-31 (which Date would roll over).
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Today's date in UTC. Used for "overdue": a loan is overdue once its end date is over everywhere relevant to the server. */
export function utcToday(now: number): string {
  return toIsoDate(now);
}

/**
 * The earliest calendar date currently in effect anywhere on Earth (UTC-12).
 * A start date before this is in the past for *every* user, so we reject it.
 * This avoids rejecting "today" for a user whose local date is behind UTC
 * without trusting a client-supplied timezone.
 */
export function earliestValidStartDate(now: number): string {
  return toIsoDate(now - 12 * 60 * 60 * 1000);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / DAY_MS);
}

/** Inclusive day ranges overlap when each starts on or before the other ends. */
export function rangesOverlap(
  a: { startDate: string; endDate: string },
  b: { startDate: string; endDate: string },
): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

export const MAX_LOAN_DAYS = 60;

export type DateRangeError =
  | "INVALID_DATE"
  | "START_AFTER_END"
  | "START_IN_PAST"
  | "RANGE_TOO_LONG";

/** Validates a requested borrow range. Returns null when valid. */
export function validateLoanRange(
  startDate: string,
  endDate: string,
  now: number,
): DateRangeError | null {
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) return "INVALID_DATE";
  if (startDate > endDate) return "START_AFTER_END";
  if (startDate < earliestValidStartDate(now)) return "START_IN_PAST";
  if (daysBetween(startDate, endDate) + 1 > MAX_LOAN_DAYS) return "RANGE_TOO_LONG";
  return null;
}
