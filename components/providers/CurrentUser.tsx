"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { errorMessage } from "@/lib/errors";
import { ErrorState, LoadingState } from "@/components/ui/States";

export type CurrentUser = NonNullable<FunctionReturnType<typeof api.users.me>>;

const CurrentUserContext = createContext<CurrentUser | null>(null);

export function useCurrentUser(): CurrentUser {
  const user = useContext(CurrentUserContext);
  if (!user) throw new Error("useCurrentUser must be used inside <CurrentUserGate>");
  return user;
}

/**
 * Syncs the Clerk user into Convex once per session, then renders children
 * with the user available via context. Authed pages never render before the
 * Convex `users` row exists, so their queries cannot hit USER_NOT_SYNCED.
 */
export function CurrentUserGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const sync = useMutation(api.users.syncCurrentUser);
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const [syncError, setSyncError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || started.current) return;
    started.current = true;
    sync().catch((err: unknown) => setSyncError(errorMessage(err)));
  }, [isAuthenticated, sync]);

  if (syncError) return <ErrorState title="We couldn't set up your account" message={syncError} />;
  if (isLoading || !isAuthenticated || !me) return <LoadingState label="Loading your account…" />;
  return <CurrentUserContext.Provider value={me}>{children}</CurrentUserContext.Provider>;
}
