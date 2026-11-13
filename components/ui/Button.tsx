import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const styles: Record<Variant, string> = {
  primary: "bg-moss-700 text-white hover:bg-moss-800 disabled:bg-moss-700/50",
  secondary: "bg-white text-ink-900 ring-1 ring-inset ring-ink-200 hover:bg-ink-50 disabled:text-ink-400",
  danger: "bg-white text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-50 disabled:text-red-300",
  ghost: "text-ink-700 hover:bg-ink-100 disabled:text-ink-400",
};

export function Button({
  variant = "primary",
  pending = false,
  className = "",
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; pending?: boolean }) {
  return (
    <button
      {...props}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-moss-600 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
    >
      {pending && <span className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />}
      {children}
    </button>
  );
}
