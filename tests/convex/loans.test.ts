// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/convex/_generated/api";
import { NOW, listTool, setup, signIn } from "./setup";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

async function world() {
  const t = setup();
  const alice = await signIn(t, "Alice"); // lender
  const bob = await signIn(t, "Bob"); // borrower
  const carol = await signIn(t, "Carol"); // another borrower
  const toolId = await listTool(alice.as);
  return { t, alice, bob, carol, toolId };
}

describe("requesting", () => {
  it("validates dates, ownership and duplicates", async () => {
    const { alice, bob, toolId } = await world();
    await expect(bob.as.mutation(api.loans.request, { toolId, startDate: "2026-06-12", endDate: "2026-06-11" })).rejects.toThrow(/start date/i);
    await expect(bob.as.mutation(api.loans.request, { toolId, startDate: "2026-06-01", endDate: "2026-06-11" })).rejects.toThrow(/past/i);
    await expect(alice.as.mutation(api.loans.request, { toolId, startDate: "2026-06-11", endDate: "2026-06-12" })).rejects.toThrow(/own tool/i);

    await bob.as.mutation(api.loans.request, { toolId, startDate: "2026-06-11", endDate: "2026-06-12" });
    await expect(bob.as.mutation(api.loans.request, { toolId, startDate: "2026-06-20", endDate: "2026-06-21" })).rejects.toThrow(/already/i);
  });

  it("rejects dates overlapping an approved loan, but allows adjacent ones", async () => {
    const { alice, bob, carol, toolId } = await world();
    const loanId = await bob.as.mutation(api.loans.request, { toolId, startDate: "2026-06-11", endDate: "2026-06-13" });
    await alice.as.mutation(api.loans.approve, { loanId });

    await expect(carol.as.mutation(api.loans.request, { toolId, startDate: "2026-06-13", endDate: "2026-06-15" })).rejects.toThrow(/overlap/i);
    await expect(carol.as.mutation(api.loans.request, { toolId, startDate: "2026-06-14", endDate: "2026-06-15" })).resolves.toBeTruthy();
  });
});

describe("transitions", () => {
  it("pending -> approved -> returned, by the lender", async () => {
    const { alice, bob, toolId } = await world();
    const loanId = await bob.as.mutation(api.loans.request, { toolId, startDate: "2026-06-10", endDate: "2026-06-12" });

    await expect(bob.as.mutation(api.loans.approve, { loanId })).rejects.toThrow(/only the lender/i);
    await alice.as.mutation(api.loans.approve, { loanId });
    expect((await alice.as.query(api.tools.mine, {}))[0]?.availability).toBe("on_loan");

    // Borrower cannot self-certify a return (see README).
    await expect(bob.as.mutation(api.loans.markReturned, { loanId })).rejects.toThrow(/only the lender/i);
    await alice.as.mutation(api.loans.markReturned, { loanId });

    const [mine] = await bob.as.query(api.loans.myRequests, {});
    expect(mine?.status).toBe("returned");
    // Terminal: nothing else is allowed.
    await expect(alice.as.mutation(api.loans.approve, { loanId })).rejects.toThrow(/cannot become/i);
  });

  it("borrower can cancel only while pending; lender can decline only while pending", async () => {
    const { alice, bob, toolId } = await world();
    const loanId = await bob.as.mutation(api.loans.request, { toolId, startDate: "2026-06-11", endDate: "2026-06-12" });
    await expect(alice.as.mutation(api.loans.cancel, { loanId })).rejects.toThrow(/only the borrower/i);
    await bob.as.mutation(api.loans.cancel, { loanId });
    await expect(alice.as.mutation(api.loans.decline, { loanId })).rejects.toThrow(/cannot become/i);
  });

  it("approving one request auto-declines overlapping pending requests", async () => {
    const { alice, bob, carol, toolId } = await world();
    const bobLoan = await bob.as.mutation(api.loans.request, { toolId, startDate: "2026-06-11", endDate: "2026-06-13" });
    const carolLoan = await carol.as.mutation(api.loans.request, { toolId, startDate: "2026-06-12", endDate: "2026-06-14" });

    await alice.as.mutation(api.loans.approve, { loanId: bobLoan });
    const [carolView] = await carol.as.query(api.loans.myRequests, {});
    expect(carolView?._id).toBe(carolLoan);
    expect(carolView?.status).toBe("declined");
  });

  it("derives overdue once the end date passes", async () => {
    const { alice, bob, toolId } = await world();
    const loanId = await bob.as.mutation(api.loans.request, { toolId, startDate: "2026-06-10", endDate: "2026-06-11" });
    await alice.as.mutation(api.loans.approve, { loanId });
    vi.setSystemTime(new Date("2026-06-13T09:00:00Z"));
    const [view] = await alice.as.query(api.loans.incoming, {});
    expect(view?.status).toBe("overdue");
  });
});

describe("deleting listings", () => {
  it("blocks owners while lent out, and declines pending requests on delete", async () => {
    const { alice, bob, carol, toolId } = await world();
    const bobLoan = await bob.as.mutation(api.loans.request, { toolId, startDate: "2026-06-10", endDate: "2026-06-11" });
    await alice.as.mutation(api.loans.approve, { loanId: bobLoan });
    await expect(alice.as.mutation(api.tools.remove, { toolId })).rejects.toThrow(/returned/i);

    await alice.as.mutation(api.loans.markReturned, { loanId: bobLoan });
    await carol.as.mutation(api.loans.request, { toolId, startDate: "2026-06-20", endDate: "2026-06-21" });
    await alice.as.mutation(api.tools.remove, { toolId });

    const [carolView] = await carol.as.query(api.loans.myRequests, {});
    expect(carolView?.status).toBe("declined");
    expect(carolView?.toolRemoved).toBe(true);
    expect(await carol.as.query(api.tools.list, {})).toEqual([]);
  });
});

describe("category filter", () => {
  it("filters the board server-side", async () => {
    const { t, alice } = await world();
    await alice.as.mutation(api.tools.create, { name: "Tent", category: "camping", condition: "good", description: "" });
    const viewer = await signIn(t, "Dan");
    expect((await viewer.as.query(api.tools.list, { category: "camping" })).map((x) => x.name)).toEqual(["Tent"]);
    expect(await viewer.as.query(api.tools.list, {})).toHaveLength(2);
  });
});
