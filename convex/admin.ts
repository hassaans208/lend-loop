import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { appError, requireRole } from "./lib/auth";
import { utcToday } from "./lib/dates";
import { displayStatus } from "./lib/stateMachine";
import { softDeleteTool } from "./tools";

/** Every function here starts with requireRole(ctx, "admin"). There is no other gate. */

const LIMIT = 200;

export const allLoans = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    const today = utcToday(Date.now());
    const loans = await ctx.db.query("loans").withIndex("by_createdAt").order("desc").take(LIMIT);
    return await Promise.all(
      loans.map(async (loan) => {
        const [tool, borrower, lender] = await Promise.all([
          ctx.db.get(loan.toolId),
          ctx.db.get(loan.borrowerId),
          ctx.db.get(loan.lenderId),
        ]);
        return {
          _id: loan._id,
          toolName: tool?.name ?? "Removed listing",
          borrowerName: borrower?.name ?? "Unknown",
          lenderName: lender?.name ?? "Unknown",
          startDate: loan.startDate,
          endDate: loan.endDate,
          status: displayStatus(loan, today),
          createdAt: loan.createdAt,
        };
      }),
    );
  },
});

export const allTools = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_deletedAt", (q) => q.eq("deletedAt", undefined))
      .order("desc")
      .take(LIMIT);
    return await Promise.all(
      tools.map(async (tool) => {
        const owner = await ctx.db.get(tool.ownerId);
        return { _id: tool._id, name: tool.name, category: tool.category, ownerName: owner?.name ?? "Unknown" };
      }),
    );
  },
});

/** Users list for the Trusted Lender toggle. Admins see emails because they need to identify people. */
export const allUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    const users = await ctx.db.query("users").take(LIMIT);
    return users.map((u) => ({ _id: u._id, name: u.name, email: u.email, role: u.role, trustedLender: u.trustedLender }));
  },
});

export const removeListing = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    await requireRole(ctx, "admin");
    const tool = await ctx.db.get(toolId);
    if (!tool || tool.deletedAt !== undefined) throw appError("NOT_FOUND", "Listing not found.");
    // Admin removal is moderation: allowed even mid-loan. The loan record stays so it can still be returned.
    await softDeleteTool(ctx, tool, { allowActiveLoan: true });
    return null;
  },
});

export const setTrustedLender = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, { userId, trusted }) => {
    await requireRole(ctx, "admin");
    const user = await ctx.db.get(userId);
    if (!user) throw appError("NOT_FOUND", "User not found.");
    await ctx.db.patch(userId, { trustedLender: trusted });
    return null;
  },
});

/** Failed automations, so nothing fails silently. */
export const failedAutomations = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, "admin");
    const [events, runs] = await Promise.all([
      ctx.db
        .query("automationEvents")
        .withIndex("by_status", (q) => q.eq("status", "failed"))
        .order("desc")
        .take(50),
      ctx.db.query("workflowFailures").withIndex("by_createdAt").order("desc").take(50),
    ]);
    return {
      events: events.map((e) => ({
        _id: e._id,
        loanId: e.loanId,
        type: e.type,
        idempotencyKey: e.idempotencyKey,
        runId: e.runId,
        error: e.error ?? null,
        at: e.updatedAt ?? e.createdAt,
      })),
      runs: runs.map((r) => ({
        _id: r._id,
        workflowName: r.workflowName,
        executionId: r.executionId,
        lastNode: r.lastNode ?? null,
        message: r.message,
        at: r.createdAt,
      })),
    };
  },
});
