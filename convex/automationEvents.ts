import { v } from "convex/values";
import { query } from "./_generated/server";
import { hasRole, requireUser } from "./lib/auth";

/** Recent automation activity for one loan ("Reminder sent 2 days ago"). Parties to the loan and admins only. */
export const forLoan = query({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const me = await requireUser(ctx);
    const loan = await ctx.db.get(loanId);
    if (!loan) return [];
    const involved = loan.borrowerId === me._id || loan.lenderId === me._id || hasRole(me, "admin");
    if (!involved) return [];
    const events = await ctx.db
      .query("automationEvents")
      .withIndex("by_loan", (q) => q.eq("loanId", loanId))
      .order("desc")
      .take(5);
    return events.map((e) => ({ _id: e._id, type: e.type, status: e.status, at: e.updatedAt ?? e.createdAt }));
  },
});
