// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DISPATCH_MAX_ATTEMPTS } from "@/convex/lib/automation";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, signPayload, verifySignature } from "@/convex/lib/signature";
import type { T } from "./setup";
import { NOW, listTool, setup, signIn } from "./setup";

const SECRET = "integration-test-secret";
const WEBHOOK = "https://n8n.test/webhook/lendloop-loan-events";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("LENDLOOP_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("N8N_WEBHOOK_URL", WEBHOOK);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function requestedLoan() {
  const t = setup();
  const alice = await signIn(t, "Alice");
  const bob = await signIn(t, "Bob");
  const toolId = await listTool(alice.as);
  const loanId = await bob.as.mutation(api.loans.request, { toolId, startDate: "2026-06-10", endDate: "2026-06-11" });
  return { t, alice, bob, toolId, loanId };
}

async function events(t: T) {
  return await t.run(async (ctx) => await ctx.db.query("automationEvents").collect());
}

async function signedFetch(t: T, path: string, body: unknown, opts: { secret?: string; at?: number } = {}) {
  const raw = JSON.stringify(body);
  const { signature, timestamp } = await signPayload(opts.secret ?? SECRET, raw, opts.at ?? Date.now() / 1000);
  return await t.fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", [SIGNATURE_HEADER]: signature, [TIMESTAMP_HEADER]: timestamp },
    body: raw,
  });
}

describe("Convex -> n8n dispatch", () => {
  it("sends a signed, minimal payload to n8n when a request is created", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { t, loanId } = await requestedLoan();
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(WEBHOOK);
    const headers = init!.headers as Record<string, string>;
    const rawBody = init!.body as string;
    const verified = await verifySignature({
      secret: SECRET,
      rawBody,
      signatureHeader: headers[SIGNATURE_HEADER]!,
      timestampHeader: headers[TIMESTAMP_HEADER]!,
      nowSeconds: Date.now() / 1000,
    });
    expect(verified.ok).toBe(true);

    const payload = JSON.parse(rawBody);
    expect(payload).toEqual({
      eventType: "loan.status_changed",
      idempotencyKey: `notify:${loanId}:pending`,
      loanId,
      status: "pending",
      recipientRole: "lender",
      recipient: { email: "alice@example.com", name: "Alice" },
      toolName: "Cordless drill",
      startDate: "2026-06-10",
      endDate: "2026-06-11",
    });
    // No ids of people, no borrower details sent to the lender's notification.
    expect(rawBody).not.toContain("bob@example.com");
  });

  it("retries 5xx with backoff, then records a failed event (nothing fails silently)", async () => {
    const fetchMock = vi.fn(async () => new Response("down", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const { t, loanId } = await requestedLoan();
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(fetchMock).toHaveBeenCalledTimes(DISPATCH_MAX_ATTEMPTS);
    const [event] = await events(t);
    expect(event).toMatchObject({ loanId, status: "failed", idempotencyKey: `notify:${loanId}:pending`, error: "n8n responded with HTTP 503" });
  });

  it("does not retry a 401 (bad signature will not fix itself)", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const { t } = await requestedLoan();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await events(t))[0]?.status).toBe("failed");
  });

  it("records a failure when the webhook is not configured", async () => {
    vi.stubEnv("N8N_WEBHOOK_URL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { t } = await requestedLoan();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await events(t))[0]?.error).toMatch(/not configured/);
  });

  it("skips dispatch when the event was already delivered", async () => {
    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    const { t, loanId } = await requestedLoan();
    await t.mutation(internal.automation.recordEvent, {
      loanId,
      idempotencyKey: `notify:${loanId}:pending`,
      type: "request_notification",
      status: "sent",
      runId: "n8n:1",
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("n8n -> Convex write-back (idempotency)", () => {
  const event = (loanId: Id<"loans">, status: "sent" | "failed", runId: string) => ({
    idempotencyKey: `notify:${loanId}:pending`,
    loanId,
    type: "request_notification",
    status,
    runId,
  });

  it("upserts by idempotency key: retries never create duplicates", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("ok")));
    const { t, loanId } = await requestedLoan();

    expect((await signedFetch(t, "/n8n/events", event(loanId, "failed", "n8n:1"))).status).toBe(200);
    const second = await signedFetch(t, "/n8n/events", event(loanId, "sent", "n8n:2"));
    expect(await second.json()).toEqual({ ok: true, decision: "update" });
    const third = await signedFetch(t, "/n8n/events", event(loanId, "sent", "n8n:3"));
    expect(await third.json()).toEqual({ ok: true, decision: "noop" });
    // A late failure must not overwrite a delivered event.
    await signedFetch(t, "/n8n/events", event(loanId, "failed", "n8n:4"));

    const rows = await events(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "sent", runId: "n8n:2" });
  });

  it("rejects unsigned, wrongly signed, stale and malformed requests", async () => {
    const { t, loanId } = await requestedLoan();
    const body = event(loanId, "sent", "n8n:1");

    const unsigned = await t.fetch("/n8n/events", { method: "POST", body: JSON.stringify(body) });
    expect(unsigned.status).toBe(401);
    expect((await signedFetch(t, "/n8n/events", body, { secret: "wrong" })).status).toBe(401);
    expect((await signedFetch(t, "/n8n/events", body, { at: Date.now() / 1000 - 600 })).status).toBe(401);
    expect((await signedFetch(t, "/n8n/events", { ...body, status: "delivered" })).status).toBe(400);
    expect(await events(t)).toHaveLength(0);
  });

  it("refuses keys that do not belong to the loan, and unknown loans", async () => {
    const { t, loanId } = await requestedLoan();
    const res = await signedFetch(t, "/n8n/events", { ...event(loanId, "sent", "n8n:1"), idempotencyKey: "notify:someone-else:approved" });
    expect(res.status).toBe(422);
    const unknown = await signedFetch(t, "/n8n/events", { ...event(loanId, "sent", "n8n:1"), loanId: "not-a-real-id" });
    expect(unknown.status).toBe(422);
  });

  it("shows written-back events to the parties of the loan", async () => {
    const { t, bob, loanId } = await requestedLoan();
    await signedFetch(t, "/n8n/events", event(loanId, "sent", "n8n:1"));
    const activity = await bob.as.query(api.automationEvents.forLoan, { loanId });
    expect(activity).toMatchObject([{ type: "request_notification", status: "sent" }]);
  });
});

describe("overdue endpoint", () => {
  it("returns overdue loans once per day and never after a reminder was sent", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("ok")));
    const { t, alice, loanId } = await requestedLoan();
    await alice.as.mutation(api.loans.approve, { loanId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    // Not overdue yet.
    let res = await signedFetch(t, "/n8n/overdue-loans", {});
    expect((await res.json()).loans).toEqual([]);

    vi.setSystemTime(new Date("2026-06-14T06:00:00Z"));
    res = await signedFetch(t, "/n8n/overdue-loans", {});
    const body = await res.json();
    expect(body.asOf).toBe("2026-06-14");
    expect(body.loans).toEqual([
      {
        loanId,
        idempotencyKey: `overdue:${loanId}:2026-06-14`,
        recipient: { email: "bob@example.com", name: "Bob" },
        toolName: "Cordless drill",
        endDate: "2026-06-11",
        daysOverdue: 3,
      },
    ]);

    // n8n writes back "sent" -> a second run the same day returns nothing (no double reminder).
    await signedFetch(t, "/n8n/events", {
      idempotencyKey: `overdue:${loanId}:2026-06-14`,
      loanId,
      type: "overdue_reminder",
      status: "sent",
      runId: "n8n:99",
    });
    res = await signedFetch(t, "/n8n/overdue-loans", {});
    expect((await res.json()).loans).toEqual([]);

    // Next day it is due again.
    vi.setSystemTime(new Date("2026-06-15T06:00:00Z"));
    res = await signedFetch(t, "/n8n/overdue-loans", {});
    expect((await res.json()).loans).toHaveLength(1);
  });
});

describe("workflow failures", () => {
  it("records each failed n8n execution once and surfaces it to admins", async () => {
    vi.stubEnv("ADMIN_EMAILS", "root@example.com");
    const t = setup();
    const root = await signIn(t, "Root");
    const failure = { workflowName: "LendLoop: Overdue reminders", executionId: "1234", lastNode: "Fetch overdue loans", message: "ECONNREFUSED" };
    await signedFetch(t, "/n8n/workflow-failures", failure);
    await signedFetch(t, "/n8n/workflow-failures", failure);

    const { runs } = await root.as.query(api.admin.failedAutomations, {});
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ workflowName: "LendLoop: Overdue reminders", message: "ECONNREFUSED" });
  });
});
