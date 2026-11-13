import type { LoanStatus } from "./validators";

/**
 * Loan lifecycle.
 *
 *   pending ──► approved ──► returned
 *      ├──────► declined
 *      └──────► cancelled
 *
 * `overdue` is NOT stored. It is derived (approved + end date passed + not
 * returned). Storing it would need a cron to flip it and would create a second
 * source of truth that can disagree with the dates.
 */

export type Actor = "lender" | "borrower" | "admin" | "system";

type Rule = { to: LoanStatus; actors: readonly Actor[] };

const TRANSITIONS: Record<LoanStatus, readonly Rule[]> = {
  pending: [
    { to: "approved", actors: ["lender"] },
    // "system" declines pending requests when a listing is deleted.
    { to: "declined", actors: ["lender", "system"] },
    { to: "cancelled", actors: ["borrower"] },
  ],
  // Only the lender (or an admin resolving a dispute) confirms a return.
  // See README "Why only the lender marks returned".
  approved: [{ to: "returned", actors: ["lender", "admin"] }],
  declined: [],
  cancelled: [],
  returned: [],
};

export class TransitionError extends Error {
  constructor(
    readonly code: "INVALID_TRANSITION" | "FORBIDDEN_TRANSITION",
    message: string,
  ) {
    super(message);
    this.name = "TransitionError";
  }
}

export function canTransition(from: LoanStatus, to: LoanStatus, actor: Actor): boolean {
  return TRANSITIONS[from].some((rule) => rule.to === to && rule.actors.includes(actor));
}

/** Throws a TransitionError describing *why* the transition is not allowed. */
export function assertTransition(from: LoanStatus, to: LoanStatus, actor: Actor): void {
  const rule = TRANSITIONS[from].find((r) => r.to === to);
  if (!rule) {
    throw new TransitionError("INVALID_TRANSITION", `A ${from} request cannot become ${to}.`);
  }
  if (!rule.actors.includes(actor)) {
    throw new TransitionError("FORBIDDEN_TRANSITION", `Only the ${rule.actors.join(" or ")} can mark this ${to}.`);
  }
}

export function isTerminal(status: LoanStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

export type DisplayStatus = LoanStatus | "overdue";

export function isOverdue(loan: { status: LoanStatus; endDate: string }, todayIso: string): boolean {
  return loan.status === "approved" && loan.endDate < todayIso;
}

export function displayStatus(loan: { status: LoanStatus; endDate: string }, todayIso: string): DisplayStatus {
  return isOverdue(loan, todayIso) ? "overdue" : loan.status;
}
