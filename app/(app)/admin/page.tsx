"use client";

import { useMutation, useQuery } from "convex/react";
import type { ReactNode } from "react";
import { useCurrentUser } from "@/components/providers/CurrentUser";
import { StatusBadge, TrustedBadge } from "@/components/ui/Badges";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, InlineError, SkeletonList } from "@/components/ui/States";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CATEGORY_LABELS } from "@/convex/lib/validators";
import { formatRange, timeAgo } from "@/lib/format";
import { useMutationState } from "@/lib/useMutationState";

/**
 * Hiding this page from non-admins is UX only. Every query below calls
 * requireRole(ctx, "admin") in Convex, which is the real gate.
 */
export default function AdminPage() {
  const me = useCurrentUser();
  if (me.role !== "admin") {
    return <ErrorState title="Admins only" message="You don't have access to this page." />;
  }
  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
      <FailedAutomations />
      <AllLoans />
      <div className="grid gap-10 lg:grid-cols-2">
        <Listings />
        <Users />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function FailedAutomations() {
  const data = useQuery(api.admin.failedAutomations);
  return (
    <Section title="Failed automations">
      {data === undefined ? (
        <SkeletonList rows={1} />
      ) : data.events.length === 0 && data.runs.length === 0 ? (
        <EmptyState title="All automations healthy">No failed notifications, reminders or workflow runs.</EmptyState>
      ) : (
        <ul className="divide-y divide-red-100 rounded-xl bg-red-50/60 ring-1 ring-red-100">
          {data.events.map((e) => (
            <li key={e._id} className="px-4 py-3 text-sm">
              <p className="font-medium text-red-900">
                {e.type === "overdue_reminder" ? "Overdue reminder" : "Request notification"} failed · {timeAgo(e.at)}
              </p>
              <p className="font-mono text-xs text-red-800">{e.idempotencyKey}</p>
              {e.error && <p className="text-red-800">{e.error}</p>}
            </li>
          ))}
          {data.runs.map((r) => (
            <li key={r._id} className="px-4 py-3 text-sm">
              <p className="font-medium text-red-900">
                Workflow “{r.workflowName}” failed{r.lastNode ? ` at ${r.lastNode}` : ""} · {timeAgo(r.at)}
              </p>
              <p className="text-red-800">{r.message}</p>
              <p className="font-mono text-xs text-red-700">execution {r.executionId}</p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function AllLoans() {
  const loans = useQuery(api.admin.allLoans);
  return (
    <Section title="All loans">
      {loans === undefined ? (
        <SkeletonList rows={2} />
      ) : loans.length === 0 ? (
        <EmptyState title="No loans yet" />
      ) : (
        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-ink-100">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Tool</th>
                <th scope="col" className="px-4 py-2 font-medium">Lender</th>
                <th scope="col" className="px-4 py-2 font-medium">Borrower</th>
                <th scope="col" className="px-4 py-2 font-medium">Dates</th>
                <th scope="col" className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {loans.map((l) => (
                <tr key={l._id}>
                  <td className="px-4 py-2">{l.toolName}</td>
                  <td className="px-4 py-2">{l.lenderName}</td>
                  <td className="px-4 py-2">{l.borrowerName}</td>
                  <td className="whitespace-nowrap px-4 py-2">{formatRange(l.startDate, l.endDate)}</td>
                  <td className="px-4 py-2">
                    <StatusBadge value={l.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function Listings() {
  const tools = useQuery(api.admin.allTools);
  return (
    <Section title="Listings">
      {tools === undefined ? (
        <SkeletonList rows={2} />
      ) : tools.length === 0 ? (
        <EmptyState title="No listings" />
      ) : (
        <ul className="divide-y divide-ink-100 rounded-xl bg-white ring-1 ring-ink-100">
          {tools.map((t) => (
            <li key={t._id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{t.name}</p>
                <p className="text-ink-500">
                  {CATEGORY_LABELS[t.category]} · {t.ownerName}
                </p>
              </div>
              <RemoveListingButton toolId={t._id} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function RemoveListingButton({ toolId }: { toolId: Id<"tools"> }) {
  const remove = useMutationState(useMutation(api.admin.removeListing));
  return (
    <div className="text-right">
      <Button variant="danger" pending={remove.pending} onClick={() => void remove.run({ toolId })}>
        Remove
      </Button>
      <InlineError message={remove.error} />
    </div>
  );
}

function Users() {
  const users = useQuery(api.admin.allUsers);
  const setTrusted = useMutationState(useMutation(api.admin.setTrustedLender));
  return (
    <Section title="Lenders">
      <InlineError message={setTrusted.error} />
      {users === undefined ? (
        <SkeletonList rows={2} />
      ) : (
        <ul className="divide-y divide-ink-100 rounded-xl bg-white ring-1 ring-ink-100">
          {users.map((u) => (
            <li key={u._id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {u.name} {u.role === "admin" && <span className="text-xs text-ink-500">(admin)</span>}
                  {u.trustedLender && <TrustedBadge />}
                </p>
                <p className="truncate text-ink-500">{u.email}</p>
              </div>
              <label className="flex shrink-0 items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 accent-moss-700"
                  checked={u.trustedLender}
                  onChange={(e) => void setTrusted.run({ userId: u._id, trusted: e.target.checked })}
                />
                Trusted
              </label>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
