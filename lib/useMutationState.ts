"use client";

import { useCallback, useState } from "react";
import { errorMessage } from "./errors";

/**
 * Wraps a Convex mutation call with pending + error state so every button
 * can show "Saving…" and a readable error without repeating try/catch.
 */
export function useMutationState<Args extends unknown[], R>(fn: (...args: Args) => Promise<R>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (...args: Args): Promise<R | undefined> => {
      setPending(true);
      setError(null);
      try {
        return await fn(...args);
      } catch (err) {
        setError(errorMessage(err));
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [fn],
  );

  return { run, pending, error, clearError: () => setError(null) };
}
