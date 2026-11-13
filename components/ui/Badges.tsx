import type { Availability } from "@/convex/lib/availability";
import type { DisplayStatus } from "@/convex/lib/stateMachine";

const pill = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset";

const AVAILABILITY: Record<Availability, { label: string; cls: string }> = {
  available: { label: "Available", cls: "bg-moss-50 text-moss-800 ring-moss-200" },
  requested: { label: "Requested", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  on_loan: { label: "On loan", cls: "bg-ink-100 text-ink-700 ring-ink-200" },
};

export function AvailabilityBadge({ value }: { value: Availability }) {
  const { label, cls } = AVAILABILITY[value];
  return <span className={`${pill} ${cls}`}>{label}</span>;
}

const STATUS: Record<DisplayStatus, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  approved: { label: "Approved", cls: "bg-moss-50 text-moss-800 ring-moss-200" },
  declined: { label: "Declined", cls: "bg-ink-100 text-ink-600 ring-ink-200" },
  cancelled: { label: "Cancelled", cls: "bg-ink-100 text-ink-600 ring-ink-200" },
  returned: { label: "Returned", cls: "bg-sky-50 text-sky-800 ring-sky-200" },
  overdue: { label: "Overdue", cls: "bg-red-50 text-red-800 ring-red-200" },
};

export function StatusBadge({ value }: { value: DisplayStatus }) {
  const { label, cls } = STATUS[value];
  return <span className={`${pill} ${cls}`}>{label}</span>;
}

export function TrustedBadge() {
  return (
    <span className={`${pill} bg-sky-50 text-sky-800 ring-sky-200`} title="Verified by a LendLoop admin">
      <svg viewBox="0 0 16 16" className="size-3" fill="currentColor" aria-hidden>
        <path d="M8 1 2.5 3.2v4.1c0 3.3 2.3 6.3 5.5 7.2 3.2-.9 5.5-3.9 5.5-7.2V3.2L8 1Zm-1 10L4.3 8.3l1-1L7 9l3.7-3.7 1 1L7 11Z" />
      </svg>
      Trusted Lender
    </span>
  );
}
