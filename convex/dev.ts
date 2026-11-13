import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { isIsoDate } from "./lib/dates";

/**
 * Dev/demo helper: move a loan's dates into the past so the overdue workflow
 * has something to remind about.
 *
 *   npx convex run dev:backdateLoan '{"loanId":"<id>","startDate":"2026-01-01","endDate":"2026-01-03"}'
 *
 * internalMutation = not callable from the browser, only with deployment
 * credentials (CLI / dashboard). Refuses to run unless ALLOW_DEV_TOOLS=true.
 */
export const backdateLoan = internalMutation({
  args: { loanId: v.id("loans"), startDate: v.string(), endDate: v.string() },
  handler: async (ctx, { loanId, startDate, endDate }) => {
    if (process.env.ALLOW_DEV_TOOLS !== "true") throw new Error("Set ALLOW_DEV_TOOLS=true on this deployment to use dev tools.");
    if (!isIsoDate(startDate) || !isIsoDate(endDate) || startDate > endDate) throw new Error("Invalid dates");
    await ctx.db.patch(loanId, { startDate, endDate, updatedAt: Date.now() });
    return null;
  },
});
