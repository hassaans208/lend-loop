import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import {
  DISPATCH_MAX_ATTEMPTS,
  backoffDelayMs,
  keyMatchesLoan,
  notificationRecipient,
  notifyKey,
  overdueKey,
  upsertDecision,
} from "./lib/automation";
import { daysBetween, utcToday } from "./lib/dates";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, signPayload } from "./lib/signature";
import type { AutomationEventStatus, AutomationEventType } from "./lib/validators";
import {
  automationEventStatusValidator,
  automationEventTypeValidator,
  loanStatusValidator,
} from "./lib/validators";

/**
 * Convex -> n8n: outbound notification dispatch.
 *
 * Scheduled (not awaited) from mutations, so a slow or down n8n never blocks
 * or fails a user's action. Convex only schedules the action if the mutation
 * commits, so we never notify about a change that was rolled back.
 */

const REQUEST_TIMEOUT_MS = 10_000;

/** Exactly the fields the n8n workflow needs to send one message. Nothing else leaves Convex. */
export const notificationPayload = internalQuery({
  args: { loanId: v.id("loans"), status: loanStatusValidator },
  handler: async (ctx, { loanId, status }) => {
    const loan = await ctx.db.get(loanId);
    if (!loan) return null;
    const recipientRole = notificationRecipient(status);
    const [tool, recipient] = await Promise.all([
      ctx.db.get(loan.toolId),
      ctx.db.get(recipientRole === "lender" ? loan.lenderId : loan.borrowerId),
    ]);
    if (!recipient) return null;
    return {
      eventType: "loan.status_changed" as const,
      idempotencyKey: notifyKey(loanId, status),
      loanId,
      status,
      recipientRole,
      recipient: { email: recipient.email, name: recipient.name },
      toolName: tool?.name ?? "a tool",
      startDate: loan.startDate,
      endDate: loan.endDate,
    };
  },
});

export const eventByKey = internalQuery({
  args: { idempotencyKey: v.string() },
  handler: async (ctx, { idempotencyKey }) =>
    await ctx.db
      .query("automationEvents")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", idempotencyKey))
      .unique(),
});

/** Status codes worth retrying. Other 4xx (bad signature, bad payload) will not fix themselves. */
function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

export const dispatchNotification = internalAction({
  args: { loanId: v.id("loans"), status: loanStatusValidator, attempt: v.number() },
  handler: async (ctx, { loanId, status, attempt }) => {
    const idempotencyKey = notifyKey(loanId, status);

    // Already delivered (e.g. this is a duplicate schedule). Do nothing.
    const existing = await ctx.runQuery(internal.automation.eventByKey, { idempotencyKey });
    if (existing?.status === "sent") return;

    const payload = await ctx.runQuery(internal.automation.notificationPayload, { loanId, status });
    if (!payload) return;

    const recordFailure = (error: string) =>
      ctx.runMutation(internal.automation.recordEvent, {
        loanId,
        idempotencyKey,
        type: "request_notification",
        status: "failed",
        runId: `convex-dispatch:attempt-${attempt + 1}`,
        error,
      });

    const url = process.env.N8N_WEBHOOK_URL;
    const secret = process.env.LENDLOOP_WEBHOOK_SECRET;
    if (!url || !secret) {
      // Recorded rather than silently skipped, so it shows up in the admin view.
      await recordFailure("N8N_WEBHOOK_URL or LENDLOOP_WEBHOOK_SECRET is not configured in Convex.");
      return;
    }

    const body = JSON.stringify(payload);
    const { signature, timestamp } = await signPayload(secret, body, Date.now() / 1000);

    let error: string;
    let retryable = true;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", [SIGNATURE_HEADER]: signature, [TIMESTAMP_HEADER]: timestamp },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (res.ok) return; // n8n writes back "sent" (or "failed") once it has actually notified.
      error = `n8n responded with HTTP ${res.status}`;
      retryable = isRetryableStatus(res.status);
    } catch (err) {
      error = err instanceof Error ? `${err.name}: ${err.message}` : "Unknown network error";
    }

    if (retryable && attempt + 1 < DISPATCH_MAX_ATTEMPTS) {
      const delay = backoffDelayMs(attempt);
      console.warn(`[dispatch] ${idempotencyKey} attempt ${attempt + 1} failed (${error}); retrying in ${delay}ms`);
      await ctx.scheduler.runAfter(delay, internal.automation.dispatchNotification, {
        loanId,
        status,
        attempt: attempt + 1,
      });
      return;
    }
    console.error(`[dispatch] ${idempotencyKey} gave up after ${attempt + 1} attempt(s): ${error}`);
    await recordFailure(error);
  },
});

const eventArgs = {
  idempotencyKey: v.string(),
  type: automationEventTypeValidator,
  status: automationEventStatusValidator,
  runId: v.string(),
  error: v.optional(v.string()),
};

/**
 * Idempotent upsert keyed by idempotencyKey. Convex mutations are
 * serializable transactions, so two concurrent write-backs with the same key
 * cannot both see "no row" and both insert.
 */
async function upsertEvent(
  ctx: MutationCtx,
  args: {
    loanId: Id<"loans">;
    idempotencyKey: string;
    type: AutomationEventType;
    status: AutomationEventStatus;
    runId: string;
    error?: string;
  },
) {
  const existing = await ctx.db
    .query("automationEvents")
    .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", args.idempotencyKey))
    .unique();
  const decision = upsertDecision(existing?.status ?? null, args.status);
  const now = Date.now();
  const error = args.error?.slice(0, 500);

  if (decision === "insert") {
    await ctx.db.insert("automationEvents", { ...args, error, createdAt: now });
  } else if (decision === "update" && existing) {
    await ctx.db.patch(existing._id, { status: args.status, runId: args.runId, error, updatedAt: now });
  }
  return { decision };
}

export const recordEvent = internalMutation({
  args: { loanId: v.id("loans"), ...eventArgs },
  handler: (ctx, args) => upsertEvent(ctx, args),
});

/** Entry point for n8n write-backs (via the signed HTTP endpoint). Loan id arrives as a string. */
export const recordEventFromWebhook = internalMutation({
  args: { loanId: v.string(), ...eventArgs },
  handler: async (ctx, { loanId: rawLoanId, ...rest }) => {
    const loanId = ctx.db.normalizeId("loans", rawLoanId);
    if (!loanId || !(await ctx.db.get(loanId))) return { ok: false as const, reason: "UNKNOWN_LOAN" };
    // The key must belong to the loan it is filed under, so a caller cannot overwrite other loans' events.
    if (!keyMatchesLoan(rest.idempotencyKey, rest.type, loanId)) return { ok: false as const, reason: "KEY_MISMATCH" };
    const { decision } = await upsertEvent(ctx, { loanId, ...rest });
    return { ok: true as const, decision };
  },
});

const OVERDUE_BATCH = 100;

/**
 * Overdue loans that have NOT already had a reminder sent today. This
 * filtering is what makes re-running the daily workflow safe: a second run on
 * the same day returns nothing, so no double reminders.
 */
export const overdueLoans = internalQuery({
  args: {},
  handler: async (ctx) => {
    const today = utcToday(Date.now());
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_status_endDate", (q) => q.eq("status", "approved").lt("endDate", today))
      .take(OVERDUE_BATCH * 2);

    const results = [];
    for (const loan of loans) {
      const idempotencyKey = overdueKey(loan._id, today);
      const sent = await ctx.db
        .query("automationEvents")
        .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", idempotencyKey))
        .unique();
      if (sent?.status === "sent") continue;
      const [tool, borrower] = await Promise.all([ctx.db.get(loan.toolId), ctx.db.get(loan.borrowerId)]);
      if (!borrower) continue;
      results.push({
        loanId: loan._id,
        idempotencyKey,
        recipient: { email: borrower.email, name: borrower.name },
        toolName: tool?.name ?? "a tool",
        endDate: loan.endDate,
        daysOverdue: daysBetween(loan.endDate, today),
      });
      if (results.length >= OVERDUE_BATCH) break;
    }
    return { asOf: today, loans: results };
  },
});

export const recordWorkflowFailure = internalMutation({
  args: { workflowName: v.string(), executionId: v.string(), lastNode: v.optional(v.string()), message: v.string() },
  handler: async (ctx, args) => {
    // The error workflow can itself be retried; one row per n8n execution.
    const existing = await ctx.db
      .query("workflowFailures")
      .withIndex("by_executionId", (q) => q.eq("executionId", args.executionId))
      .unique();
    if (existing) return { decision: "noop" as const };
    await ctx.db.insert("workflowFailures", {
      workflowName: args.workflowName.slice(0, 120),
      executionId: args.executionId.slice(0, 64),
      lastNode: args.lastNode?.slice(0, 120),
      message: args.message.slice(0, 1000),
      createdAt: Date.now(),
    });
    return { decision: "insert" as const };
  },
});
