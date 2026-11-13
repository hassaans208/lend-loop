import { mutation, query } from "./_generated/server";
import { appError, getCurrentUser, parseAdminEmails, roleForEmail } from "./lib/auth";

/**
 * Called by the client right after Clerk sign-in. Creates the user row on
 * first sign-in and refreshes name/email/role on later ones.
 *
 * Identity data comes from the verified Clerk JWT (ctx.auth), never from
 * client arguments, so a user cannot claim someone else's email or role.
 * Role is recomputed every time, so removing an email from ADMIN_EMAILS
 * demotes that admin on their next sign-in.
 */
export const syncCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw appError("UNAUTHENTICATED", "Please sign in.");
    if (!identity.email) throw appError("VALIDATION", "Your account needs an email address.");

    const email = identity.email.toLowerCase();
    const name = (identity.name ?? identity.givenName ?? email.split("@")[0] ?? "Neighbour").slice(0, 80);
    const role = roleForEmail(email, identity.emailVerified === true, parseAdminEmails(process.env.ADMIN_EMAILS));

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (existing) {
      if (existing.email !== email || existing.name !== name || existing.role !== role) {
        await ctx.db.patch(existing._id, { email, name, role });
      }
      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkId: identity.subject,
      email,
      name,
      role,
      trustedLender: false,
    });
  },
});

/** The current user's own profile. Only the fields the UI needs. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    return { _id: user._id, name: user.name, role: user.role, trustedLender: user.trustedLender };
  },
});
