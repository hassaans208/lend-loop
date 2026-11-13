"use client";

import { useQuery } from "convex/react";
import { LoanList } from "@/components/loans/LoanList";
import { api } from "@/convex/_generated/api";

export default function MyRequestsPage() {
  const loans = useQuery(api.loans.myRequests);
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My requests</h1>
        <p className="text-sm text-ink-500">Things you&apos;ve asked to borrow.</p>
      </div>
      <LoanList loans={loans} perspective="borrower" emptyTitle="No requests yet" emptyHint="Find something on the Browse tab and request it." />
    </section>
  );
}
