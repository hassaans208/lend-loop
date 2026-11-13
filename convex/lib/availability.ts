import type { LoanStatus } from "./validators";

export type Availability = "available" | "on_loan" | "requested";

/**
 * Availability shown on the board, derived from the tool's open loans.
 * - on_loan:   an approved, unreturned loan has started (includes overdue)
 * - requested: someone has a pending request
 * - available: otherwise (a future approved booking does not block today)
 */
export function computeAvailability(
  loans: ReadonlyArray<{ status: LoanStatus; startDate: string }>,
  todayIso: string,
): Availability {
  if (loans.some((l) => l.status === "approved" && l.startDate <= todayIso)) return "on_loan";
  if (loans.some((l) => l.status === "pending")) return "requested";
  return "available";
}
