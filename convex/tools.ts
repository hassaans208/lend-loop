import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { appError, requireOwnedTool, requireUser } from "./lib/auth";
import { computeAvailability } from "./lib/availability";
import { utcToday } from "./lib/dates";
import { openLoansForTool } from "./lib/loanQueries";
import { assertTransition } from "./lib/stateMachine";
import type { Category, Condition } from "./lib/validators";
import { LIMITS, categoryValidator, conditionValidator } from "./lib/validators";

/** Upper bound for list queries. Fine for a neighbourhood; see README for pagination. */
const LIST_LIMIT = 300;

async function liveTools(ctx: QueryCtx, category?: Category): Promise<Doc<"tools">[]> {
  const q = category
    ? ctx.db
        .query("tools")
        .withIndex("by_category_deletedAt", (i) => i.eq("category", category).eq("deletedAt", undefined))
    : ctx.db.query("tools").withIndex("by_deletedAt", (i) => i.eq("deletedAt", undefined));
  return await q.order("desc").take(LIST_LIMIT);
}

/**
 * PUBLIC, unauthenticated. Data minimisation: returns exactly `name` and
 * `category` for currently available tools. No ids, no owner, no description.
 */
export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const today = utcToday(Date.now());
    const tools = await liveTools(ctx);
    const rows = await Promise.all(
      tools.map(async (tool) => ({
        tool,
        availability: computeAvailability(await openLoansForTool(ctx, tool._id), today),
      })),
    );
    return rows
      .filter((r) => r.availability !== "on_loan")
      .map(({ tool }) => ({ name: tool.name, category: tool.category }));
  },
});

/** Signed-in board: all live tools with availability, optionally filtered by category. */
export const list = query({
  args: { category: v.optional(categoryValidator) },
  handler: async (ctx, { category }) => {
    const me = await requireUser(ctx);
    const today = utcToday(Date.now());
    const tools = await liveTools(ctx, category);
    return await Promise.all(
      tools.map(async (tool) => {
        const [owner, openLoans] = await Promise.all([ctx.db.get(tool.ownerId), openLoansForTool(ctx, tool._id)]);
        return {
          _id: tool._id,
          name: tool.name,
          category: tool.category,
          condition: tool.condition,
          description: tool.description,
          availability: computeAvailability(openLoans, today),
          // Neighbours see a display name and trust badge, never an email.
          owner: { name: owner?.name ?? "Neighbour", trustedLender: owner?.trustedLender ?? false },
          isMine: tool.ownerId === me._id,
          myPendingRequest: openLoans.some((l) => l.borrowerId === me._id && l.status === "pending"),
          // Approved date ranges let borrowers pick free dates without seeing who booked them.
          bookedRanges: openLoans
            .filter((l) => l.status === "approved")
            .map((l) => ({ startDate: l.startDate, endDate: l.endDate })),
        };
      }),
    );
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const today = utcToday(Date.now());
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", me._id))
      .order("desc")
      .take(LIST_LIMIT);
    return await Promise.all(
      tools
        .filter((t) => t.deletedAt === undefined)
        .map(async (tool) => {
          const openLoans = await openLoansForTool(ctx, tool._id);
          return {
            _id: tool._id,
            name: tool.name,
            category: tool.category,
            condition: tool.condition,
            description: tool.description,
            createdAt: tool.createdAt,
            availability: computeAvailability(openLoans, today),
            pendingCount: openLoans.filter((l) => l.status === "pending").length,
          };
        }),
    );
  },
});

const toolInput = {
  name: v.string(),
  category: categoryValidator,
  condition: conditionValidator,
  description: v.string(),
};

/** Validators check types; this checks content (lengths, blank strings). */
function cleanToolInput(input: { name: string; category: Category; condition: Condition; description: string }) {
  const name = input.name.trim().replace(/\s+/g, " ");
  const description = input.description.trim();
  if (name.length < LIMITS.toolName.min || name.length > LIMITS.toolName.max) {
    throw appError("VALIDATION", `Name must be ${LIMITS.toolName.min}-${LIMITS.toolName.max} characters.`);
  }
  if (description.length > LIMITS.description.max) {
    throw appError("VALIDATION", `Description must be at most ${LIMITS.description.max} characters.`);
  }
  return { name, category: input.category, condition: input.condition, description };
}

export const create = mutation({
  args: toolInput,
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    return await ctx.db.insert("tools", { ...cleanToolInput(args), ownerId: me._id, createdAt: Date.now() });
  },
});

export const update = mutation({
  args: { toolId: v.id("tools"), ...toolInput },
  handler: async (ctx, { toolId, ...fields }) => {
    const me = await requireUser(ctx);
    await requireOwnedTool(ctx, toolId, me._id);
    await ctx.db.patch(toolId, cleanToolInput(fields));
    return null;
  },
});

/**
 * Soft delete + decline any pending requests (so borrowers are notified).
 * Owners cannot delete a tool that is currently lent out; the loan has to be
 * marked returned first so the record stays coherent. Admins can force it
 * (see admin.removeListing), which reuses this helper.
 */
export async function softDeleteTool(
  ctx: MutationCtx,
  tool: Doc<"tools">,
  opts: { allowActiveLoan: boolean },
): Promise<void> {
  const openLoans = await openLoansForTool(ctx, tool._id);
  if (!opts.allowActiveLoan && openLoans.some((l) => l.status === "approved")) {
    throw appError("CONFLICT", "This tool has an approved loan. Mark it returned before deleting.");
  }
  const now = Date.now();
  for (const loan of openLoans.filter((l) => l.status === "pending")) {
    assertTransition(loan.status, "declined", "system");
    await ctx.db.patch(loan._id, { status: "declined", updatedAt: now });
    await ctx.scheduler.runAfter(0, internal.automation.dispatchNotification, {
      loanId: loan._id,
      status: "declined",
      attempt: 0,
    });
  }
  await ctx.db.patch(tool._id, { deletedAt: now });
}

export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    const me = await requireUser(ctx);
    const tool = await requireOwnedTool(ctx, toolId, me._id);
    await softDeleteTool(ctx, tool, { allowActiveLoan: false });
    return null;
  },
});
