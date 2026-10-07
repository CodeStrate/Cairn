const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const dateFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const dateYearFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function relativeTime(timestamp: number, now = Date.now()): string {
  if (!timestamp) return "Unknown";
  const delta = now - timestamp;
  if (delta < MINUTE) return "Just now";
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)}m ago`;
  if (timestamp >= startOfDay(now)) return `${Math.floor(delta / HOUR)}h ago`;
  if (timestamp >= startOfDay(now) - DAY) return "Yesterday";
  const sameYear = new Date(timestamp).getFullYear() === new Date(now).getFullYear();
  return (sameYear ? dateFormatter : dateYearFormatter).format(timestamp);
}

export function formatDateTime(timestamp: number): string {
  return timestamp ? dateTimeFormatter.format(timestamp) : "Unknown";
}

export function dateBucket(timestamp: number, now = Date.now()): string {
  const today = startOfDay(now);
  if (timestamp >= today) return "Today";
  if (timestamp >= today - DAY) return "Yesterday";
  if (timestamp >= today - 7 * DAY) return "Previous 7 Days";
  if (timestamp >= today - 30 * DAY) return "Previous 30 Days";
  return "Earlier";
}

export function shortenPath(target: string, home: string): string {
  if (target === home) return "~";
  return target.startsWith(`${home}/`) ? `~${target.slice(home.length)}` : target;
}

export function baseName(target: string): string {
  const parts = target.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? target;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
