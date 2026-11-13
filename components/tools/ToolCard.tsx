"use client";

import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { AvailabilityBadge, TrustedBadge } from "@/components/ui/Badges";
import { Button } from "@/components/ui/Button";
import type { api } from "@/convex/_generated/api";
import { CATEGORY_LABELS, CONDITION_LABELS } from "@/convex/lib/validators";
import { formatRange } from "@/lib/format";
import { RequestForm } from "./RequestForm";

export type BoardTool = FunctionReturnType<typeof api.tools.list>[number];

export function ToolCard({ tool }: { tool: BoardTool }) {
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState(false);

  return (
    <article className="flex h-full flex-col rounded-xl bg-white p-4 ring-1 ring-ink-100">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-medium text-ink-900">{tool.name}</h2>
          <p className="text-sm text-ink-500">
            {CATEGORY_LABELS[tool.category]} · {CONDITION_LABELS[tool.condition]}
          </p>
        </div>
        <AvailabilityBadge value={tool.availability} />
      </div>

      {tool.description && <p className="mt-2 text-sm text-ink-700">{tool.description}</p>}

      <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-500">
        Lent by {tool.isMine ? "you" : tool.owner.name}
        {tool.owner.trustedLender && <TrustedBadge />}
      </p>

      {tool.bookedRanges.length > 0 && (
        <p className="mt-1 text-xs text-ink-500">
          Booked: {tool.bookedRanges.map((r) => formatRange(r.startDate, r.endDate)).join(", ")}
        </p>
      )}

      <div className="mt-auto pt-4">
        {tool.isMine ? null : tool.myPendingRequest || requested ? (
          <p className="text-sm text-moss-700" role="status">
            Request sent. Track it under My requests.
          </p>
        ) : requesting ? (
          <RequestForm
            toolId={tool._id}
            bookedRanges={tool.bookedRanges}
            onDone={() => {
              setRequesting(false);
              setRequested(true);
            }}
            onCancel={() => setRequesting(false)}
          />
        ) : (
          <Button variant="secondary" onClick={() => setRequesting(true)}>
            Request to borrow
          </Button>
        )}
      </div>
    </article>
  );
}
