"use client";

import { useQuery } from "convex/react";
import { LoanList } from "@/components/loans/LoanList";
import { api } from "@/convex/_generated/api";

export default function IncomingRequestsPage() {
  const loans = useQuery(api.loans.incoming);
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Incoming requests</h1>
        <p className="text-sm text-ink-500">Neighbours asking to borrow your tools.</p>
      </div>
      <LoanList loans={loans} perspective="lender" emptyTitle="No incoming requests" emptyHint="When someone asks to borrow one of your tools, it shows up here." />
    </section>
  );
}
