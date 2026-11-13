import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  automationEventStatusValidator,
  automationEventTypeValidator,
  categoryValidator,
  conditionValidator,
  loanStatusValidator,
  roleValidator,
} from "./lib/validators";

/**
 * Data model. Every query path in the codebase has a matching index so no
 * function ever does a full table scan with `.filter()` on user data.
 *
 * Dates for loans are stored as ISO calendar dates ("YYYY-MM-DD") because a
 * loan is a *day* range, not an instant. ISO dates also compare correctly as
 * plain strings, which keeps overlap and overdue checks simple.
 */
export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    role: roleValidator,
    trustedLender: v.boolean(),
  })
    .index("by_clerkId", ["clerkId"])
    .index("by_email", ["email"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: categoryValidator,
    condition: conditionValidator,
    description: v.string(),
    createdAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_category_deletedAt", ["category", "deletedAt"])
    .index("by_deletedAt", ["deletedAt"]),

  loans: defineTable({
    toolId: v.id("tools"),
    borrowerId: v.id("users"),
    lenderId: v.id("users"),
    startDate: v.string(),
    endDate: v.string(),
    status: loanStatusValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
    returnedAt: v.optional(v.number()),
  })
    .index("by_borrower", ["borrowerId"])
    .index("by_lender", ["lenderId"])
    .index("by_tool_status", ["toolId", "status"])
    .index("by_status_endDate", ["status", "endDate"])
    .index("by_createdAt", ["createdAt"]),

  automationEvents: defineTable({
    loanId: v.id("loans"),
    type: automationEventTypeValidator,
    status: automationEventStatusValidator,
    idempotencyKey: v.string(),
    runId: v.string(),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_idempotencyKey", ["idempotencyKey"])
    .index("by_loan", ["loanId"])
    .index("by_status", ["status"]),

  /**
   * Whole-run failures reported by the n8n Error Workflow. These are not tied
   * to a single loan (e.g. "Convex endpoint unreachable"), so they live in
   * their own table instead of forcing a fake loanId into automationEvents.
   */
  workflowFailures: defineTable({
    workflowName: v.string(),
    executionId: v.string(),
    lastNode: v.optional(v.string()),
    message: v.string(),
    createdAt: v.number(),
  })
    .index("by_executionId", ["executionId"])
    .index("by_createdAt", ["createdAt"]),
});
