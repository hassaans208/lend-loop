"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { StatusBadge, TrustedBadge } from "@/components/ui/Badges";
import { Button } from "@/components/ui/Button";
import { EmptyState, InlineError, SkeletonList } from "@/components/ui/States";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatRange, timeAgo } from "@/lib/format";
import { useMutationState } from "@/lib/useMutationState";

export type LoanView = FunctionReturnType<typeof api.loans.myRequests>[number];
type Perspective = "borrower" | "lender";

export function LoanList({
  loans,
  perspective,
  emptyTitle,
  emptyHint,
}: {
  loans: LoanView[] | undefined;
  perspective: Perspective;
  emptyTitle: string;
  emptyHint: string;
}) {
  if (loans === undefined) return <SkeletonList />;
  if (loans.length === 0) return <EmptyState title={emptyTitle}>{emptyHint}</EmptyState>;
  return (
    <ul className="space-y-3">
      {loans.map((loan) => (
        <li key={loan._id}>
          <LoanRow loan={loan} perspective={perspective} />
        </li>
      ))}
    </ul>
  );
}

function LoanRow({ loan, perspective }: { loan: LoanView; perspective: Perspective }) {
  return (
    <article className="rounded-xl bg-white p-4 ring-1 ring-ink-100">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-medium">
            {loan.toolName}
            {loan.toolRemoved && <span className="ml-2 text-xs font-normal text-ink-500">(listing removed)</span>}
          </h2>
          <p className="text-sm text-ink-500">{formatRange(loan.startDate, loan.endDate)}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-600">
            {perspective === "borrower" ? `From ${loan.counterpart.name}` : `Requested by ${loan.counterpart.name}`}
            {perspective === "borrower" && loan.counterpart.trustedLender && <TrustedBadge />}
          </p>
        </div>
        <StatusBadge value={loan.status} />
      </div>
      <LoanActions loanId={loan._id} status={loan.status} perspective={perspective} />
      <AutomationActivity loanId={loan._id} />
    </article>
  );
}

function LoanActions({ loanId, status, perspective }: { loanId: Id<"loans">; status: LoanView["status"]; perspective: Perspective }) {
  const approve = useMutationState(useMutation(api.loans.approve));
  const decline = useMutationState(useMutation(api.loans.decline));
  const cancel = useMutationState(useMutation(api.loans.cancel));
  const markReturned = useMutationState(useMutation(api.loans.markReturned));
  const error = approve.error ?? decline.error ?? cancel.error ?? markReturned.error;

  // Buttons mirror the server's state machine. The server is still the authority.
  let buttons: React.ReactNode = null;
  if (perspective === "lender" && status === "pending") {
    buttons = (
      <>
        <Button pending={approve.pending} onClick={() => void approve.run({ loanId })}>
          Approve
        </Button>
        <Button variant="secondary" pending={decline.pending} onClick={() => void decline.run({ loanId })}>
          Decline
        </Button>
      </>
    );
  } else if (perspective === "lender" && (status === "approved" || status === "overdue")) {
    buttons = (
      <Button variant="secondary" pending={markReturned.pending} onClick={() => void markReturned.run({ loanId })}>
        Mark as returned
      </Button>
    );
  } else if (perspective === "borrower" && status === "pending") {
    buttons = (
      <Button variant="ghost" pending={cancel.pending} onClick={() => void cancel.run({ loanId })}>
        Cancel request
      </Button>
    );
  }

  if (!buttons && !error) return null;
  return (
    <div className="mt-3 space-y-2">
      {buttons && <div className="flex flex-wrap gap-2">{buttons}</div>}
      <InlineError message={error} />
    </div>
  );
}

const EVENT_LABEL = { request_notification: "Notification", overdue_reminder: "Reminder" } as const;

/** "Reminder sent 2 days ago" — written back by n8n, read live from Convex. */
function AutomationActivity({ loanId }: { loanId: Id<"loans"> }) {
  const events = useQuery(api.automationEvents.forLoan, { loanId });
  if (!events || events.length === 0) return null;
  return (
    <ul className="mt-3 space-y-0.5 border-t border-ink-100 pt-2 text-xs text-ink-500" aria-label="Automation activity">
      {events.map((e) => (
        <li key={e._id} className={e.status === "failed" ? "text-red-700" : undefined}>
          {EVENT_LABEL[e.type]} {e.status === "sent" ? "sent" : "failed"} {timeAgo(e.at)}
        </li>
      ))}
    </ul>
  );
}
