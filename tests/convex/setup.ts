import { convexTest } from "convex-test";
import { api } from "@/convex/_generated/api";
import schema from "@/convex/schema";

// Every Convex module except generated .d.ts and test files.
export const modules = import.meta.glob("../../convex/**/!(*.*.*)*.*s");

export const TODAY = "2026-06-10";
export const NOW = new Date(`${TODAY}T09:00:00Z`);

export function setup() {
  return convexTest(schema, modules);
}

export type T = ReturnType<typeof setup>;

/** Signs in a fake Clerk identity and syncs the users row, like the client does. */
export async function signIn(t: T, name: string, opts: { emailVerified?: boolean } = {}) {
  const email = `${name.toLowerCase()}@example.com`;
  const as = t.withIdentity({ subject: `user_${name.toLowerCase()}`, email, name, emailVerified: opts.emailVerified ?? true });
  const userId = await as.mutation(api.users.syncCurrentUser, {});
  return { as, userId, email };
}

export async function listTool(as: Awaited<ReturnType<typeof signIn>>["as"], name = "Cordless drill") {
  return await as.mutation(api.tools.create, { name, category: "power_tools", condition: "good", description: "18V, two batteries" });
}
