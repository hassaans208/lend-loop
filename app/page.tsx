"use client";

import { SignInButton, Show } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { EmptyState, SkeletonList } from "@/components/ui/States";
import { api } from "@/convex/_generated/api";
import { CATEGORY_LABELS } from "@/convex/lib/validators";

/** Public, signed-out landing page. Reads only `tools.listPublic` (name + category). */
export default function HomePage() {
  const tools = useQuery(api.tools.listPublic);

  return (
    <div className="space-y-10">
      <section className="pt-8 sm:pt-14">
        <h1 className="text-4xl font-semibold tracking-tight text-ink-900 sm:text-5xl">LendLoop</h1>
        <p className="mt-3 max-w-xl text-lg text-ink-600">Borrow what you need. Lend what you don&apos;t.</p>
        <p className="mt-2 max-w-xl text-sm text-ink-500">
          A tool-lending board for your neighbourhood. List the drill you use twice a year, borrow the tent you need for one weekend.
        </p>
        <div className="mt-6">
          <Show when="signed-out">
            <SignInButton mode="modal">
              <Button>Sign in to lend or borrow</Button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <Link
              href="/tools"
              className="inline-flex min-h-9 items-center rounded-lg bg-moss-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-moss-800"
            >
              Go to the board
            </Link>
          </Show>
        </div>
      </section>

      <section aria-labelledby="available-heading">
        <h2 id="available-heading" className="text-sm font-semibold uppercase tracking-wide text-ink-500">
          Available right now
        </h2>
        <div className="mt-4">
          {tools === undefined ? (
            <SkeletonList rows={3} />
          ) : tools.length === 0 ? (
            <EmptyState title="Nothing listed yet">Be the first neighbour to lend something.</EmptyState>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tools.map((tool, i) => (
                // The public query returns no ids by design, so index + content is the key.
                <li key={`${i}-${tool.name}`} className="rounded-xl bg-white px-4 py-3 ring-1 ring-ink-100">
                  <p className="font-medium text-ink-900">{tool.name}</p>
                  <p className="text-sm text-ink-500">{CATEGORY_LABELS[tool.category]}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
