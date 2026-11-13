import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useId } from "react";

const control =
  "mt-1 block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-ink-900 ring-1 ring-inset ring-ink-200 placeholder:text-ink-400 focus:ring-2 focus:ring-moss-600 focus:outline-none";

function Wrapper({ id, label, hint, children }: { id: string; label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink-800">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-500">
          {hint}
        </p>
      )}
    </div>
  );
}

export function TextField({ label, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode }) {
  const id = useId();
  return (
    <Wrapper id={id} label={label} hint={hint}>
      <input id={id} aria-describedby={hint ? `${id}-hint` : undefined} className={control} {...props} />
    </Wrapper>
  );
}

export function TextAreaField({ label, hint, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: ReactNode }) {
  const id = useId();
  return (
    <Wrapper id={id} label={label} hint={hint}>
      <textarea id={id} aria-describedby={hint ? `${id}-hint` : undefined} className={`${control} min-h-20`} {...props} />
    </Wrapper>
  );
}

export function SelectField({
  label,
  options,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; options: ReadonlyArray<{ value: string; label: string }> }) {
  const id = useId();
  return (
    <Wrapper id={id} label={label}>
      <select id={id} className={control} {...props}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Wrapper>
  );
}
