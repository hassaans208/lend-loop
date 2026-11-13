import { ConvexError } from "convex/values";

/**
 * Server errors thrown with appError() arrive as ConvexError with a
 * `{ code, message }` payload. Anything else (network blips, bugs) gets a
 * generic message: internal error details are never shown to users.
 */
export function errorMessage(err: unknown): string {
  if (err instanceof ConvexError) {
    const data = err.data as { message?: unknown } | string;
    if (typeof data === "string") return data;
    if (typeof data?.message === "string") return data.message;
  }
  return "Something went wrong. Please try again.";
}
