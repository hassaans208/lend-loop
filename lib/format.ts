const dateFormatter = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", timeZone: "UTC" });

export function formatDay(iso: string): string {
  return dateFormatter.format(new Date(`${iso}T00:00:00Z`));
}

export function formatRange(startIso: string, endIso: string): string {
  return startIso === endIso ? formatDay(startIso) : `${formatDay(startIso)} – ${formatDay(endIso)}`;
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/** "2 days ago", "just now", ... */
export function timeAgo(ms: number, now: number = Date.now()): string {
  const seconds = Math.round((ms - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return "just now";
  if (abs < 3600) return relative.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return relative.format(Math.round(seconds / 3600), "hour");
  return relative.format(Math.round(seconds / 86400), "day");
}

/** Today's date in the user's local timezone, for <input type="date" min>. */
export function localTodayIso(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
