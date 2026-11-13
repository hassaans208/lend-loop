"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { InlineError } from "@/components/ui/States";
import type { Category, Condition } from "@/convex/lib/validators";
import { CATEGORY_LABELS, CATEGORY_VALUES, CONDITION_LABELS, CONDITION_VALUES, LIMITS } from "@/convex/lib/validators";

export type ToolFormValues = { name: string; category: Category; condition: Condition; description: string };

const EMPTY: ToolFormValues = { name: "", category: "power_tools", condition: "good", description: "" };

const categoryOptions = CATEGORY_VALUES.map((value) => ({ value, label: CATEGORY_LABELS[value] }));
const conditionOptions = CONDITION_VALUES.map((value) => ({ value, label: CONDITION_LABELS[value] }));

export function ToolForm({
  initial = EMPTY,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  initial?: ToolFormValues;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (values: ToolFormValues) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<ToolFormValues>(initial);
  const set = <K extends keyof ToolFormValues>(key: K, value: ToolFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await onSubmit(values);
    if (ok && initial === EMPTY) setValues(EMPTY);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <TextField
        label="Name"
        required
        minLength={LIMITS.toolName.min}
        maxLength={LIMITS.toolName.max}
        placeholder="e.g. Cordless drill"
        value={values.name}
        onChange={(e) => set("name", e.target.value)}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Category" options={categoryOptions} value={values.category} onChange={(e) => set("category", e.target.value as Category)} />
        <SelectField label="Condition" options={conditionOptions} value={values.condition} onChange={(e) => set("condition", e.target.value as Condition)} />
      </div>
      <TextAreaField
        label="Short description"
        maxLength={LIMITS.description.max}
        hint={`${values.description.length}/${LIMITS.description.max}. Mention anything a borrower should know (batteries, bits included…).`}
        value={values.description}
        onChange={(e) => set("description", e.target.value)}
      />
      <InlineError message={error} />
      <div className="flex gap-2">
        <Button type="submit" pending={pending}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
