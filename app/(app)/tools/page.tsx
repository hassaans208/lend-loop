"use client";

import { useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ToolCard } from "@/components/tools/ToolCard";
import { EmptyState, SkeletonList } from "@/components/ui/States";
import { api } from "@/convex/_generated/api";
import type { Category } from "@/convex/lib/validators";
import { CATEGORY_LABELS, CATEGORY_VALUES } from "@/convex/lib/validators";

function isCategory(value: string | null): value is Category {
  return value !== null && (CATEGORY_VALUES as readonly string[]).includes(value);
}

function Board() {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("category");
  const category = isCategory(raw) ? raw : undefined;
  // Filtering happens server-side via the by_category_deletedAt index.
  const tools = useQuery(api.tools.list, { category });

  const setCategory = (next: Category | undefined) => {
    router.replace(next ? `/tools?category=${next}` : "/tools", { scroll: false });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Browse tools</h1>
          <p className="text-sm text-ink-500">Everything your neighbours are lending.</p>
        </div>
        <fieldset>
          <legend className="sr-only">Filter by category</legend>
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={!category} onClick={() => setCategory(undefined)}>
              All
            </FilterChip>
            {CATEGORY_VALUES.map((c) => (
              <FilterChip key={c} active={category === c} onClick={() => setCategory(c)}>
                {CATEGORY_LABELS[c]}
              </FilterChip>
            ))}
          </div>
        </fieldset>
      </div>

      {tools === undefined ? (
        <SkeletonList rows={4} />
      ) : tools.length === 0 ? (
        <EmptyState title={category ? `No ${CATEGORY_LABELS[category].toLowerCase()} tools yet` : "No tools listed yet"}>
          Have something to lend? Add it under My listings.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {tools.map((tool) => (
            <li key={tool._id}>
              <ToolCard tool={tool} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-sm ring-1 ring-inset ${
        active ? "bg-moss-700 text-white ring-moss-700" : "bg-white text-ink-700 ring-ink-200 hover:bg-ink-50"
      }`}
    >
      {children}
    </button>
  );
}

export default function ToolsPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<SkeletonList rows={4} />}>
      <Board />
    </Suspense>
  );
}
