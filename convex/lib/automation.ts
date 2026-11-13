import type { AutomationEventStatus, AutomationEventType, LoanStatus } from "./validators";

/**
 * Deterministic idempotency keys. The same logical event always produces the
 * same key, so a retried webhook or a re-run workflow upserts the same row
 * instead of inserting a duplicate.
 *
 * - notify:<loanId>:<status>   one notification per status change. Loan
 *                              statuses only move forward, so each status is
 *                              reached at most once per loan.
 * - overdue:<loanId>:<date>    at most one overdue reminder per loan per day.
 */
export function notifyKey(loanId: string, status: LoanStatus): string {
  return `notify:${loanId}:${status}`;
}

export function overdueKey(loanId: string, isoDate: string): string {
  return `overdue:${loanId}:${isoDate}`;
}

/**
 * Who should hear about a status change. Each event goes to the person who
 * needs to act or who was acted upon, never to both (data minimisation).
 */
export function notificationRecipient(status: LoanStatus): "lender" | "borrower" {
  switch (status) {
    case "pending":
    case "cancelled":
      return "lender";
    case "approved":
    case "declined":
    case "returned":
      return "borrower";
  }
}

/**
 * Upsert decision for an incoming automation event write-back.
 * - no existing row         -> insert
 * - existing "sent"         -> keep (never downgrade a delivered event to failed,
 *                              and a duplicate "sent" is a no-op)
 * - existing "failed", new "sent" -> update (a retry succeeded)
 * - existing "failed", new "failed" -> update error/runId, no new row
 */
export function upsertDecision(
  existing: AutomationEventStatus | null,
  incoming: AutomationEventStatus,
): "insert" | "update" | "noop" {
  if (existing === null) return "insert";
  if (existing === "sent") return "noop";
  void incoming; // failed -> sent and failed -> failed both update the row
  return "update";
}

/**
 * An n8n write-back may only file an event under the loan its key names, and
 * the key must match the event type. Stops a caller with the secret from
 * attaching arbitrary keys to arbitrary loans.
 */
export function keyMatchesLoan(key: string, type: AutomationEventType, loanId: string): boolean {
  const prefix = type === "request_notification" ? `notify:${loanId}:` : `overdue:${loanId}:`;
  return key.startsWith(prefix) && key.length > prefix.length && key.length <= 120;
}

export const DISPATCH_MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS = 5 * 60_000;

/**
 * Exponential backoff with "equal jitter": delay is random in
 * [ceiling/2, ceiling] where ceiling = min(cap, base * 2^attempt).
 * Jitter spreads retries out so many failed calls do not all hit n8n again at
 * the same instant (thundering herd), while the floor keeps a real wait.
 */
export function backoffDelayMs(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}
