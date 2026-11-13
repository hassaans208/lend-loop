import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { appError, hasRole, requireUser } from "./lib/auth";
import { rangesOverlap, utcToday, validateLoanRange } from "./lib/dates";
import type { DateRangeError } from "./lib/dates";
import { approvedLoansForTool, openLoansForTool } from "./lib/loanQueries";
import type { Actor } from "./lib/stateMachine";
import { TransitionError, assertTransition, displayStatus } from "./lib/stateMachine";
import type { LoanStatus } from "./lib/validators";

const DATE_ERRORS: Record<DateRangeError, string> = {
  INVALID_DATE: "Please pick valid dates.",
  START_AFTER_END: "The start date must be on or before the end date.",
  START_IN_PAST: "The start date cannot be in the past.",
  RANGE_TOO_LONG: "Loans can be at most 60 days.",
};

const LIST_LIMIT = 200;

function scheduleNotification(ctx: MutationCtx, loanId: Id<"loans">, status: LoanStatus) {
  return ctx.scheduler.runAfter(0, internal.automation.dispatchNotification, { loanId, status, attempt: 0 });
}

/**
 * How is this user related to this loan? Unrelated users get NOT_FOUND
 * (not FORBIDDEN) so they cannot confirm a loan id exists.
 */
function actorFor(loan: Doc<"loans">, user: Doc<"users">): Actor {
  if (loan.lenderId === user._id) return "lender";
  if (loan.borrowerId === user._id) return "borrower";
  if (hasRole(user, "admin")) return "admin";
  throw appError("NOT_FOUND", "Request not found.");
}

/** Runs the state machine check and converts its error into a client-safe ConvexError. */
function checkTransition(from: LoanStatus, to: LoanStatus, actor: Actor) {
  try {
    assertTransition(from, to, actor);
  } catch (err) {
    if (err instanceof TransitionError) {
      throw appError(err.code === "FORBIDDEN_TRANSITION" ? "FORBIDDEN" : "CONFLICT", err.message);
    }
    throw err;
  }
}

async function loadLoan(ctx: QueryCtx, loanId: Id<"loans">): Promise<Doc<"loans">> {
  const loan = await ctx.db.get(loanId);
  if (!loan) throw appError("NOT_FOUND", "Request not found.");
  return loan;
}

async function assertNoApprovedOverlap(
  ctx: QueryCtx,
  toolId: Id<"tools">,
  range: { startDate: string; endDate: string },
  ignoreLoanId?: Id<"loans">,
) {
  const approved = await approvedLoansForTool(ctx, toolId);
  if (approved.some((l) => l._id !== ignoreLoanId && rangesOverlap(l, range))) {
    throw appError("CONFLICT", "Those dates overlap with an approved loan for this tool.");
  }
}

export const request = mutation({
  args: { toolId: v.id("tools"), startDate: v.string(), endDate: v.string() },
  handler: async (ctx, { toolId, startDate, endDate }) => {
    const me = await requireUser(ctx);
    const tool = await ctx.db.get(toolId);
    if (!tool || tool.deletedAt !== undefined) throw appError("NOT_FOUND", "Listing not found.");
    if (tool.ownerId === me._id) throw appError("VALIDATION", "You cannot borrow your own tool.");

    const now = Date.now();
    const dateError = validateLoanRange(startDate, endDate, now);
    if (dateError) throw appError("VALIDATION", DATE_ERRORS[dateError]);

    await assertNoApprovedOverlap(ctx, toolId, { startDate, endDate });

    const open = await openLoansForTool(ctx, toolId);
    if (open.some((l) => l.borrowerId === me._id && l.status === "pending")) {
      throw appError("CONFLICT", "You already have a pending request for this tool.");
    }

    const loanId = await ctx.db.insert("loans", {
      toolId,
      borrowerId: me._id,
      lenderId: tool.ownerId,
      startDate,
      endDate,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    await scheduleNotification(ctx, loanId, "pending");
    return loanId;
  },
});

export const approve = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const me = await requireUser(ctx);
    const loan = await loadLoan(ctx, loanId);
    checkTransition(loan.status, "approved", actorFor(loan, me));

    const tool = await ctx.db.get(loan.toolId);
    if (!tool || tool.deletedAt !== undefined) throw appError("CONFLICT", "This listing no longer exists.");
    const now = Date.now();
    if (loan.endDate < utcToday(now)) throw appError("CONFLICT", "This request's dates have already passed.");

    // Two pending requests can overlap; only the first one approved wins.
    await assertNoApprovedOverlap(ctx, loan.toolId, loan, loan._id);

    await ctx.db.patch(loanId, { status: "approved", updatedAt: now });
    await scheduleNotification(ctx, loanId, "approved");

    // Auto-decline other pending requests that can no longer be satisfied,
    // so borrowers are told right away instead of waiting on the lender.
    const others = await openLoansForTool(ctx, loan.toolId);
    for (const other of others) {
      if (other._id !== loanId && other.status === "pending" && rangesOverlap(other, loan)) {
        await ctx.db.patch(other._id, { status: "declined", updatedAt: now });
        await scheduleNotification(ctx, other._id, "declined");
      }
    }
    return null;
  },
});

/** Shared implementation for the simple transitions (no extra preconditions). */
async function simpleTransition(ctx: MutationCtx, loanId: Id<"loans">, to: "declined" | "cancelled" | "returned") {
  const me = await requireUser(ctx);
  const loan = await loadLoan(ctx, loanId);
  checkTransition(loan.status, to, actorFor(loan, me));
  const now = Date.now();
  await ctx.db.patch(loanId, { status: to, updatedAt: now, ...(to === "returned" ? { returnedAt: now } : {}) });
  await scheduleNotification(ctx, loanId, to);
  return null;
}

export const decline = mutation({
  args: { loanId: v.id("loans") },
  handler: (ctx, { loanId }) => simpleTransition(ctx, loanId, "declined"),
});

export const cancel = mutation({
  args: { loanId: v.id("loans") },
  handler: (ctx, { loanId }) => simpleTransition(ctx, loanId, "cancelled"),
});

export const markReturned = mutation({
  args: { loanId: v.id("loans") },
  handler: (ctx, { loanId }) => simpleTransition(ctx, loanId, "returned"),
});

/** Shapes a loan for the UI with only the counterpart's display name. */
async function toLoanView(ctx: QueryCtx, loan: Doc<"loans">, counterpartId: Id<"users">, today: string) {
  const [tool, counterpart] = await Promise.all([ctx.db.get(loan.toolId), ctx.db.get(counterpartId)]);
  return {
    _id: loan._id,
    toolName: tool?.name ?? "Removed listing",
    toolRemoved: !tool || tool.deletedAt !== undefined,
    counterpart: { name: counterpart?.name ?? "Neighbour", trustedLender: counterpart?.trustedLender ?? false },
    startDate: loan.startDate,
    endDate: loan.endDate,
    status: displayStatus(loan, today),
    createdAt: loan.createdAt,
    updatedAt: loan.updatedAt,
  };
}

/** Requests I made as a borrower. */
export const myRequests = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const today = utcToday(Date.now());
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", me._id))
      .order("desc")
      .take(LIST_LIMIT);
    return await Promise.all(loans.map((l) => toLoanView(ctx, l, l.lenderId, today)));
  },
});

/** Requests other people made for my tools. */
export const incoming = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const today = utcToday(Date.now());
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_lender", (q) => q.eq("lenderId", me._id))
      .order("desc")
      .take(LIST_LIMIT);
    return await Promise.all(loans.map((l) => toLoanView(ctx, l, l.borrowerId, today)));
  },
});
