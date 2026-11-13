import { v } from "convex/values";
import type { Infer } from "convex/values";

/**
 * Single source of truth for enums. The UI imports the `*_VALUES` arrays and
 * the backend uses the validators, so the two can never drift apart.
 */

export const CATEGORY_VALUES = ["power_tools", "garden", "kitchen", "camping", "other"] as const;
export const CONDITION_VALUES = ["new", "good", "fair", "worn"] as const;
export const ROLE_VALUES = ["user", "admin"] as const;
export const LOAN_STATUS_VALUES = ["pending", "approved", "declined", "cancelled", "returned"] as const;
export const AUTOMATION_EVENT_TYPES = ["request_notification", "overdue_reminder"] as const;
export const AUTOMATION_EVENT_STATUSES = ["sent", "failed"] as const;

export const categoryValidator = v.union(
  v.literal("power_tools"),
  v.literal("garden"),
  v.literal("kitchen"),
  v.literal("camping"),
  v.literal("other"),
);
export const conditionValidator = v.union(
  v.literal("new"),
  v.literal("good"),
  v.literal("fair"),
  v.literal("worn"),
);
export const roleValidator = v.union(v.literal("user"), v.literal("admin"));
export const loanStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("cancelled"),
  v.literal("returned"),
);
export const automationEventTypeValidator = v.union(
  v.literal("request_notification"),
  v.literal("overdue_reminder"),
);
export const automationEventStatusValidator = v.union(v.literal("sent"), v.literal("failed"));

export type Category = Infer<typeof categoryValidator>;
export type Condition = Infer<typeof conditionValidator>;
export type Role = Infer<typeof roleValidator>;
export type LoanStatus = Infer<typeof loanStatusValidator>;
export type AutomationEventType = Infer<typeof automationEventTypeValidator>;
export type AutomationEventStatus = Infer<typeof automationEventStatusValidator>;

export const CATEGORY_LABELS: Record<Category, string> = {
  power_tools: "Power tools",
  garden: "Garden",
  kitchen: "Kitchen",
  camping: "Camping",
  other: "Other",
};

export const CONDITION_LABELS: Record<Condition, string> = {
  new: "New",
  good: "Good",
  fair: "Fair",
  worn: "Worn but works",
};

/** Field limits, enforced server-side (the UI mirrors them for nicer UX). */
export const LIMITS = {
  toolName: { min: 2, max: 80 },
  description: { max: 500 },
} as const;
