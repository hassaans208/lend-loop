"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCurrentUser } from "@/components/providers/CurrentUser";
import { TrustedBadge } from "@/components/ui/Badges";

const LINKS = [
  { href: "/tools", label: "Browse" },
  { href: "/listings", label: "My listings" },
  { href: "/requests", label: "My requests" },
  { href: "/incoming", label: "Incoming" },
] as const;

export function AppNav() {
  const pathname = usePathname();
  const me = useCurrentUser();
  const links = me.role === "admin" ? [...LINKS, { href: "/admin", label: "Admin" } as const] : LINKS;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <nav aria-label="Main" className="-mx-1 flex gap-1 overflow-x-auto">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
                active ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      <p className="flex items-center gap-2 text-sm text-ink-500">
        Hi, {me.name}
        {me.trustedLender && <TrustedBadge />}
      </p>
    </div>
  );
}
