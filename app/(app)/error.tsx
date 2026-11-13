"use client";

import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/States";
import { errorMessage } from "@/lib/errors";

/** Catches errors thrown by useQuery (e.g. FORBIDDEN, network loss) in authed pages. */
export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="This page couldn't load"
      message={errorMessage(error)}
      action={
        <Button variant="secondary" onClick={reset}>
          Try again
        </Button>
      }
    />
  );
}
