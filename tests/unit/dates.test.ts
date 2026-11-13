import { describe, expect, it } from "vitest";
import { computeAvailability } from "@/convex/lib/availability";
import { daysBetween, earliestValidStartDate, isIsoDate, rangesOverlap, validateLoanRange } from "@/convex/lib/dates";

const NOW = Date.parse("2026-06-10T09:00:00Z");

describe("isIsoDate", () => {
  it("accepts real dates and rejects malformed or impossible ones", () => {
    expect(isIsoDate("2026-06-10")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-02-31")).toBe(false);
    expect(isIsoDate("2026-6-10")).toBe(false);
    expect(isIsoDate("10/06/2026")).toBe(false);
    expect(isIsoDate("2026-06-10T00:00:00Z")).toBe(false);
  });
});

describe("validateLoanRange", () => {
  it("accepts a same-day loan starting today", () => {
    expect(validateLoanRange("2026-06-10", "2026-06-10", NOW)).toBeNull();
  });
  it("rejects start after end", () => {
    expect(validateLoanRange("2026-06-12", "2026-06-11", NOW)).toBe("START_AFTER_END");
  });
  it("rejects a start date in the past for every timezone", () => {
    expect(validateLoanRange("2026-06-08", "2026-06-12", NOW)).toBe("START_IN_PAST");
  });
  it("allows 'today' for a user in UTC-10 whose local date is still yesterday", () => {
    // 09:00 UTC on the 10th is 23:00 on the 9th in Hawaii.
    expect(earliestValidStartDate(NOW)).toBe("2026-06-09");
    expect(validateLoanRange("2026-06-09", "2026-06-09", NOW)).toBeNull();
  });
  it("rejects malformed dates and overly long loans", () => {
    expect(validateLoanRange("tomorrow", "2026-06-12", NOW)).toBe("INVALID_DATE");
    expect(validateLoanRange("2026-06-10", "2026-08-30", NOW)).toBe("RANGE_TOO_LONG");
  });
});

describe("rangesOverlap (inclusive day ranges)", () => {
  const a = { startDate: "2026-06-10", endDate: "2026-06-12" };
  it.each([
    [{ startDate: "2026-06-12", endDate: "2026-06-14" }, true], // touches last day
    [{ startDate: "2026-06-08", endDate: "2026-06-10" }, true], // touches first day
    [{ startDate: "2026-06-11", endDate: "2026-06-11" }, true], // inside
    [{ startDate: "2026-06-01", endDate: "2026-06-30" }, true], // contains
    [{ startDate: "2026-06-13", endDate: "2026-06-15" }, false],
    [{ startDate: "2026-06-05", endDate: "2026-06-09" }, false],
  ])("%o -> %s", (b, expected) => {
    expect(rangesOverlap(a, b)).toBe(expected);
    expect(rangesOverlap(b, a)).toBe(expected); // symmetric
  });
});

describe("daysBetween", () => {
  it("counts calendar days", () => {
    expect(daysBetween("2026-06-01", "2026-06-10")).toBe(9);
    expect(daysBetween("2026-06-10", "2026-06-10")).toBe(0);
  });
});

describe("computeAvailability", () => {
  const today = "2026-06-10";
  it("is on_loan when an approved loan has started (including overdue)", () => {
    expect(computeAvailability([{ status: "approved", startDate: "2026-06-01" }], today)).toBe("on_loan");
  });
  it("is requested when only pending loans exist", () => {
    expect(computeAvailability([{ status: "pending", startDate: "2026-06-20" }], today)).toBe("requested");
  });
  it("is available when the only approved loan is in the future", () => {
    expect(computeAvailability([{ status: "approved", startDate: "2026-06-20" }], today)).toBe("available");
    expect(computeAvailability([], today)).toBe("available");
  });
});
