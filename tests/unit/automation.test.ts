import { describe, expect, it } from "vitest";
import {
  DISPATCH_MAX_ATTEMPTS,
  backoffDelayMs,
  keyMatchesLoan,
  notificationRecipient,
  notifyKey,
  overdueKey,
  upsertDecision,
} from "@/convex/lib/automation";
import { hasRole, parseAdminEmails, roleForEmail } from "@/convex/lib/auth";

describe("idempotency keys", () => {
  it("are deterministic", () => {
    expect(notifyKey("loan1", "approved")).toBe("notify:loan1:approved");
    expect(notifyKey("loan1", "approved")).toBe(notifyKey("loan1", "approved"));
    expect(overdueKey("loan1", "2026-06-10")).toBe("overdue:loan1:2026-06-10");
  });

  it("only accept keys that belong to the given loan and type", () => {
    expect(keyMatchesLoan("notify:loan1:approved", "request_notification", "loan1")).toBe(true);
    expect(keyMatchesLoan("overdue:loan1:2026-06-10", "overdue_reminder", "loan1")).toBe(true);
    expect(keyMatchesLoan("notify:loan2:approved", "request_notification", "loan1")).toBe(false);
    expect(keyMatchesLoan("overdue:loan1:2026-06-10", "request_notification", "loan1")).toBe(false);
    expect(keyMatchesLoan("notify:loan1:", "request_notification", "loan1")).toBe(false);
    expect(keyMatchesLoan(`notify:loan1:${"x".repeat(200)}`, "request_notification", "loan1")).toBe(false);
  });
});

describe("upsertDecision", () => {
  it("inserts when no event exists", () => {
    expect(upsertDecision(null, "sent")).toBe("insert");
    expect(upsertDecision(null, "failed")).toBe("insert");
  });
  it("never downgrades or duplicates a sent event", () => {
    expect(upsertDecision("sent", "sent")).toBe("noop");
    expect(upsertDecision("sent", "failed")).toBe("noop");
  });
  it("lets a later success (or a newer failure) update a failed event", () => {
    expect(upsertDecision("failed", "sent")).toBe("update");
    expect(upsertDecision("failed", "failed")).toBe("update");
  });
});

describe("backoffDelayMs", () => {
  it("grows exponentially within [ceiling/2, ceiling] and is capped", () => {
    expect(backoffDelayMs(0, () => 0)).toBe(1000);
    expect(backoffDelayMs(0, () => 1)).toBe(2000);
    expect(backoffDelayMs(3, () => 0)).toBe(8000);
    expect(backoffDelayMs(3, () => 1)).toBe(16000);
    expect(backoffDelayMs(20, () => 1)).toBe(5 * 60_000);
  });
  it("gives up after a bounded number of attempts", () => {
    expect(DISPATCH_MAX_ATTEMPTS).toBeGreaterThan(1);
    expect(DISPATCH_MAX_ATTEMPTS).toBeLessThanOrEqual(10);
  });
});

describe("notificationRecipient", () => {
  it("notifies the lender about new/cancelled requests and the borrower about decisions", () => {
    expect(notificationRecipient("pending")).toBe("lender");
    expect(notificationRecipient("cancelled")).toBe("lender");
    expect(notificationRecipient("approved")).toBe("borrower");
    expect(notificationRecipient("declined")).toBe("borrower");
    expect(notificationRecipient("returned")).toBe("borrower");
  });
});

describe("RBAC helpers", () => {
  const admins = parseAdminEmails(" Admin@Example.com, ops@example.com ,,");

  it("parses the allowlist case-insensitively and ignores blanks", () => {
    expect([...admins].sort()).toEqual(["admin@example.com", "ops@example.com"]);
    expect(parseAdminEmails(undefined).size).toBe(0);
  });

  it("grants admin only to verified emails on the allowlist", () => {
    expect(roleForEmail("admin@example.com", true, admins)).toBe("admin");
    expect(roleForEmail("ADMIN@example.com", true, admins)).toBe("admin");
    expect(roleForEmail("admin@example.com", false, admins)).toBe("user");
    expect(roleForEmail("someone@example.com", true, admins)).toBe("user");
  });

  it("treats admin as a superset of user", () => {
    expect(hasRole({ role: "admin" }, "admin")).toBe(true);
    expect(hasRole({ role: "admin" }, "user")).toBe(true);
    expect(hasRole({ role: "user" }, "user")).toBe(true);
    expect(hasRole({ role: "user" }, "admin")).toBe(false);
  });
});
