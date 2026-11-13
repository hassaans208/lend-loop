import type { ReactNode } from "react";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 py-12 text-sm text-ink-500">
      <span className="size-4 animate-spin rounded-full border-2 border-moss-600 border-r-transparent" aria-hidden />
      {label}
    </div>
  );
}

export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <ul aria-hidden className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="h-20 animate-pulse rounded-xl bg-ink-100" />
      ))}
      <span className="sr-only" role="status">Loading…</span>
    </ul>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-ink-200 bg-white/60 px-6 py-12 text-center">
      <p className="font-medium text-ink-900">{title}</p>
      {children && <div className="mt-2 text-sm text-ink-500">{children}</div>}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", message, action }: { title?: string; message?: string; action?: ReactNode }) {
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm">
      <p className="font-medium text-red-800">{title}</p>
      {message && <p className="mt-1 text-red-700">{message}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-red-700">
      {message}
    </p>
  );
}
