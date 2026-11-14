"use client";

import { SignInButton, Show, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

export function SiteHeader() {
  return (
    <header className="border-b border-ink-100 bg-white/70 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-ink-900">
          <LoopMark />
          LendLoop
        </Link>
        <Show when="signed-out">
          <SignInButton mode="modal">
            <Button variant="secondary">Sign in</Button>
          </SignInButton>
        </Show>
        <Show when="signed-in">
          <div className="flex items-center gap-3">
            <Link href="/tools" className="text-sm font-medium text-ink-700 hover:text-ink-900">
              Board
            </Link>
            <UserButton />
          </div>
        </Show>
      </div>
    </header>
  );
}

function LoopMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 text-moss-700" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="M7 8a4 4 0 1 0 0 8c2.5 0 3.5-2 5-4s2.5-4 5-4a4 4 0 1 1 0 8c-2.5 0-3.5-2-5-4S9.5 8 7 8Z" strokeLinecap="round" />
    </svg>
  );
}
