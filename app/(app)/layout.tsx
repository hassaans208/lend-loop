import type { ReactNode } from "react";
import { AppNav } from "@/components/AppNav";
import { CurrentUserGate } from "@/components/providers/CurrentUser";

/** Everything under (app) is protected by Clerk middleware AND by requireUser() in Convex. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <CurrentUserGate>
      <AppNav />
      <div className="mt-6">{children}</div>
    </CurrentUserGate>
  );
}
