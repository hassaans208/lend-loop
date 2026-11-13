// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/convex/_generated/api";
import { NOW, listTool, setup, signIn } from "./setup";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("ADMIN_EMAILS", "root@example.com");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("authentication", () => {
  it("rejects signed-out callers on private queries and mutations", async () => {
    const t = setup();
    await expect(t.query(api.tools.list, {})).rejects.toThrow(/sign in/i);
    await expect(t.query(api.loans.myRequests, {})).rejects.toThrow(/sign in/i);
    await expect(
      t.mutation(api.tools.create, { name: "Saw", category: "power_tools", condition: "good", description: "" }),
    ).rejects.toThrow(/sign in/i);
  });

  it("public listing returns only name and category", async () => {
    const t = setup();
    const alice = await signIn(t, "Alice");
    await listTool(alice.as);
    const rows = await t.query(api.tools.listPublic, {});
    expect(rows).toEqual([{ name: "Cordless drill", category: "power_tools" }]);
    expect(Object.keys(rows[0]!).sort()).toEqual(["category", "name"]);
  });
});

describe("admin bootstrap", () => {
  it("grants admin from ADMIN_EMAILS only when the email is verified", async () => {
    const t = setup();
    const unverified = await signIn(t, "Root", { emailVerified: false });
    expect((await unverified.as.query(api.users.me, {}))?.role).toBe("user");

    const verified = await signIn(t, "Root");
    expect((await verified.as.query(api.users.me, {}))?.role).toBe("admin");
  });

  it("demotes on next sign-in when removed from the allowlist", async () => {
    const t = setup();
    const root = await signIn(t, "Root");
    expect((await root.as.query(api.users.me, {}))?.role).toBe("admin");
    vi.stubEnv("ADMIN_EMAILS", "");
    await root.as.mutation(api.users.syncCurrentUser, {});
    expect((await root.as.query(api.users.me, {}))?.role).toBe("user");
  });
});

describe("ownership", () => {
  it("users cannot edit or delete someone else's listing", async () => {
    const t = setup();
    const alice = await signIn(t, "Alice");
    const bob = await signIn(t, "Bob");
    const toolId = await listTool(alice.as);

    await expect(
      bob.as.mutation(api.tools.update, { toolId, name: "Mine now", category: "garden", condition: "worn", description: "" }),
    ).rejects.toThrow(/not found/i);
    await expect(bob.as.mutation(api.tools.remove, { toolId })).rejects.toThrow(/not found/i);

    await alice.as.mutation(api.tools.update, { toolId, name: "Hammer drill", category: "power_tools", condition: "good", description: "" });
    const [tool] = await alice.as.query(api.tools.mine, {});
    expect(tool?.name).toBe("Hammer drill");
  });

  it("validates listing content server-side", async () => {
    const t = setup();
    const alice = await signIn(t, "Alice");
    await expect(alice.as.mutation(api.tools.create, { name: " ", category: "garden", condition: "good", description: "" })).rejects.toThrow(/name/i);
    await expect(
      alice.as.mutation(api.tools.create, { name: "Rake", category: "garden", condition: "good", description: "x".repeat(501) }),
    ).rejects.toThrow(/description/i);
  });

  it("unrelated users cannot act on a loan", async () => {
    const t = setup();
    const alice = await signIn(t, "Alice");
    const bob = await signIn(t, "Bob");
    const carol = await signIn(t, "Carol");
    const toolId = await listTool(alice.as);
    const loanId = await bob.as.mutation(api.loans.request, { toolId, startDate: "2026-06-11", endDate: "2026-06-12" });

    await expect(carol.as.mutation(api.loans.approve, { loanId })).rejects.toThrow(/not found/i);
    await expect(carol.as.mutation(api.loans.cancel, { loanId })).rejects.toThrow(/not found/i);
    expect(await carol.as.query(api.automationEvents.forLoan, { loanId })).toEqual([]);
  });
});

describe("admin-only functions", () => {
  it("reject regular users", async () => {
    const t = setup();
    const alice = await signIn(t, "Alice");
    await expect(alice.as.query(api.admin.allLoans, {})).rejects.toThrow(/permission/i);
    await expect(alice.as.query(api.admin.failedAutomations, {})).rejects.toThrow(/permission/i);
    await expect(alice.as.mutation(api.admin.setTrustedLender, { userId: alice.userId, trusted: true })).rejects.toThrow(/permission/i);
  });

  it("let admins mark trusted lenders and remove any listing", async () => {
    const t = setup();
    const root = await signIn(t, "Root");
    const alice = await signIn(t, "Alice");
    const toolId = await listTool(alice.as);

    await root.as.mutation(api.admin.setTrustedLender, { userId: alice.userId, trusted: true });
    expect((await alice.as.query(api.users.me, {}))?.trustedLender).toBe(true);
    const [boardTool] = await root.as.query(api.tools.list, {});
    expect(boardTool?.owner.trustedLender).toBe(true);

    await root.as.mutation(api.admin.removeListing, { toolId });
    expect(await alice.as.query(api.tools.mine, {})).toEqual([]);
  });
});
