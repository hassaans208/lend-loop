"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import type { ToolFormValues } from "@/components/tools/ToolForm";
import { ToolForm } from "@/components/tools/ToolForm";
import { AvailabilityBadge } from "@/components/ui/Badges";
import { Button } from "@/components/ui/Button";
import { EmptyState, InlineError, SkeletonList } from "@/components/ui/States";
import { api } from "@/convex/_generated/api";
import { CATEGORY_LABELS, CONDITION_LABELS } from "@/convex/lib/validators";
import { useMutationState } from "@/lib/useMutationState";

type MyTool = FunctionReturnType<typeof api.tools.mine>[number];

export default function MyListingsPage() {
  const tools = useQuery(api.tools.mine);
  const create = useMutationState(useMutation(api.tools.create));

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <section aria-labelledby="listings-heading" className="space-y-4">
        <h1 id="listings-heading" className="text-2xl font-semibold tracking-tight">
          My listings
        </h1>
        {tools === undefined ? (
          <SkeletonList />
        ) : tools.length === 0 ? (
          <EmptyState title="You haven't listed anything yet">Use the form to lend your first tool.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {tools.map((tool) => (
              <li key={tool._id}>
                <ListingRow tool={tool} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="new-heading" className="h-fit rounded-xl bg-white p-5 ring-1 ring-ink-100">
        <h2 id="new-heading" className="mb-4 font-semibold">
          List a tool
        </h2>
        <ToolForm
          submitLabel="Add listing"
          pending={create.pending}
          error={create.error}
          onSubmit={async (values) => (await create.run(values)) !== undefined}
        />
      </section>
    </div>
  );
}

function ListingRow({ tool }: { tool: MyTool }) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const update = useMutationState(useMutation(api.tools.update));
  const remove = useMutationState(useMutation(api.tools.remove));

  if (editing) {
    const initial: ToolFormValues = { name: tool.name, category: tool.category, condition: tool.condition, description: tool.description };
    return (
      <div className="rounded-xl bg-white p-4 ring-1 ring-ink-100">
        <ToolForm
          initial={initial}
          submitLabel="Save changes"
          pending={update.pending}
          error={update.error}
          onCancel={() => setEditing(false)}
          onSubmit={async (values) => {
            const ok = (await update.run({ toolId: tool._id, ...values })) !== undefined;
            if (ok) setEditing(false);
            return ok;
          }}
        />
      </div>
    );
  }

  return (
    <article className="rounded-xl bg-white p-4 ring-1 ring-ink-100">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">{tool.name}</h2>
          <p className="text-sm text-ink-500">
            {CATEGORY_LABELS[tool.category]} · {CONDITION_LABELS[tool.condition]}
            {tool.pendingCount > 0 && ` · ${tool.pendingCount} pending request${tool.pendingCount > 1 ? "s" : ""}`}
          </p>
        </div>
        <AvailabilityBadge value={tool.availability} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => setEditing(true)}>
          Edit
        </Button>
        {confirmingDelete ? (
          <>
            <Button variant="danger" pending={remove.pending} onClick={() => void remove.run({ toolId: tool._id })}>
              Yes, delete
            </Button>
            <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
              Keep it
            </Button>
          </>
        ) : (
          <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
            Delete
          </Button>
        )}
      </div>
      {confirmingDelete && !remove.error && tool.pendingCount > 0 && (
        <p className="mt-2 text-sm text-ink-500">Pending requests will be declined and borrowers notified.</p>
      )}
      <div className="mt-2">
        <InlineError message={remove.error} />
      </div>
    </article>
  );
}
