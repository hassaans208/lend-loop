import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/** Pending + approved (i.e. not yet finished) loans for a tool, via the by_tool_status index. */
export async function openLoansForTool(ctx: QueryCtx, toolId: Id<"tools">): Promise<Doc<"loans">[]> {
  const [pending, approved] = await Promise.all([
    ctx.db
      .query("loans")
      .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "pending"))
      .collect(),
    ctx.db
      .query("loans")
      .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "approved"))
      .collect(),
  ]);
  return [...pending, ...approved];
}

export async function approvedLoansForTool(ctx: QueryCtx, toolId: Id<"tools">): Promise<Doc<"loans">[]> {
  return await ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "approved"))
    .collect();
}
