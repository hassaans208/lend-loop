"use client";

import { useMutation } from "convex/react";
import type { FormEvent } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { InlineError } from "@/components/ui/States";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { rangesOverlap } from "@/convex/lib/dates";
import { localTodayIso } from "@/lib/format";
import { useMutationState } from "@/lib/useMutationState";

type Range = { startDate: string; endDate: string };

/**
 * Client-side checks give instant feedback, but the server re-validates
 * everything (dates, ownership, overlap) because the client can be bypassed.
 */
export function RequestForm({
  toolId,
  bookedRanges,
  onDone,
  onCancel,
}: {
  toolId: Id<"tools">;
  bookedRanges: Range[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const today = localTodayIso();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const request = useMutationState(useMutation(api.loans.request));

  const localError =
    startDate && endDate && startDate > endDate
      ? "The end date must be on or after the start date."
      : bookedRanges.some((r) => rangesOverlap(r, { startDate, endDate }))
        ? "Those dates overlap with an existing booking."
        : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (localError) return;
    const id = await request.run({ toolId, startDate, endDate });
    if (id) onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="From" type="date" required min={today} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <TextField label="Until" type="date" required min={startDate || today} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      </div>
      <InlineError message={localError ?? request.error} />
      <div className="flex gap-2">
        <Button type="submit" pending={request.pending} disabled={!!localError}>
          Send request
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
