import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Role } from "./validators";

/**
 * Every public query/mutation that touches private data goes through these
 * helpers. The UI hides buttons for convenience; these checks are the actual
 * security boundary, because anyone can call a Convex function directly with
 * their own JWT.
 */

type Ctx = QueryCtx | MutationCtx;

export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "USER_NOT_SYNCED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT";

/** Errors with a stable `code` the client can branch on, and a safe message for humans. */
export function appError(code: AppErrorCode, message: string): ConvexError<{ code: AppErrorCode; message: string }> {
  return new ConvexError({ code, message });
}

/** Returns the signed-in user's row, or null if signed out / not synced yet. */
export async function getCurrentUser(ctx: Ctx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();
}

export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw appError("UNAUTHENTICATED", "Please sign in.");
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
    .unique();
  if (!user) throw appError("USER_NOT_SYNCED", "Your account is still being set up. Try again in a moment.");
  return user;
}

export function hasRole(user: Pick<Doc<"users">, "role">, role: Role): boolean {
  // Admin is a superset of user. If more roles appear, replace with a rank map.
  return role === "user" ? true : user.role === role;
}

export async function requireRole(ctx: Ctx, role: Role): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (!hasRole(user, role)) throw appError("FORBIDDEN", "You do not have permission to do that.");
  return user;
}

/** Loads a live (not soft-deleted) tool owned by `userId`, else throws. */
export async function requireOwnedTool(
  ctx: Ctx,
  toolId: Id<"tools">,
  userId: Id<"users">,
): Promise<Doc<"tools">> {
  const tool = await ctx.db.get(toolId);
  // Same error for "missing" and "not yours" so ids cannot be probed for existence.
  if (!tool || tool.deletedAt !== undefined || tool.ownerId !== userId) {
    throw appError("NOT_FOUND", "Listing not found.");
  }
  return tool;
}

/**
 * Admin bootstrap: emails in the ADMIN_EMAILS env var (comma separated) get
 * the admin role. Only *verified* emails count, otherwise anyone could sign up
 * with an unverified admin address and escalate.
 */
export function parseAdminEmails(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function roleForEmail(email: string, emailVerified: boolean, adminEmails: Set<string>): Role {
  return emailVerified && adminEmails.has(email.toLowerCase()) ? "admin" : "user";
}
