import { describe, expect, it } from "vitest";
import type { Actor } from "@/convex/lib/stateMachine";
import { TransitionError, assertTransition, canTransition, displayStatus, isOverdue, isTerminal } from "@/convex/lib/stateMachine";
import type { LoanStatus } from "@/convex/lib/validators";
import { LOAN_STATUS_VALUES } from "@/convex/lib/validators";

const ACTORS: Actor[] = ["lender", "borrower", "admin", "system"];

/** The complete allow-list. Anything not here must be rejected. */
const ALLOWED: Array<[LoanStatus, LoanStatus, Actor]> = [
  ["pending", "approved", "lender"],
  ["pending", "declined", "lender"],
  ["pending", "declined", "system"],
  ["pending", "cancelled", "borrower"],
  ["approved", "returned", "lender"],
  ["approved", "returned", "admin"],
];

describe("loan state machine", () => {
  it("allows exactly the documented transitions (exhaustive)", () => {
    for (const from of LOAN_STATUS_VALUES) {
      for (const to of LOAN_STATUS_VALUES) {
        for (const actor of ACTORS) {
          const expected = ALLOWED.some(([f, t, a]) => f === from && t === to && a === actor);
          expect(canTransition(from, to, actor), `${from} -> ${to} by ${actor}`).toBe(expected);
        }
      }
    }
  });

  it("explains invalid vs forbidden transitions differently", () => {
    expect(() => assertTransition("returned", "approved", "lender")).toThrowError(
      expect.objectContaining({ code: "INVALID_TRANSITION" }) as Error,
    );
    expect(() => assertTransition("pending", "approved", "borrower")).toThrowError(
      expect.objectContaining({ code: "FORBIDDEN_TRANSITION" }) as Error,
    );
    expect(() => assertTransition("pending", "approved", "lender")).not.toThrow();
    try {
      assertTransition("approved", "returned", "borrower");
    } catch (err) {
      expect(err).toBeInstanceOf(TransitionError);
    }
  });

  it("does not let an admin approve on a lender's behalf", () => {
    expect(canTransition("pending", "approved", "admin")).toBe(false);
  });

  it("treats declined, cancelled and returned as terminal", () => {
    expect(isTerminal("declined")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(isTerminal("returned")).toBe(true);
    expect(isTerminal("pending")).toBe(false);
    expect(isTerminal("approved")).toBe(false);
  });

  it("derives overdue only for approved loans whose end date has passed", () => {
    const today = "2026-06-10";
    expect(isOverdue({ status: "approved", endDate: "2026-06-09" }, today)).toBe(true);
    expect(isOverdue({ status: "approved", endDate: "2026-06-10" }, today)).toBe(false); // due today is not overdue
    expect(isOverdue({ status: "returned", endDate: "2026-06-01" }, today)).toBe(false);
    expect(isOverdue({ status: "pending", endDate: "2026-06-01" }, today)).toBe(false);
    expect(displayStatus({ status: "approved", endDate: "2026-06-01" }, today)).toBe("overdue");
    expect(displayStatus({ status: "declined", endDate: "2026-06-01" }, today)).toBe("declined");
  });
});
