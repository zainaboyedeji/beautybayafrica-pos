import type { UserSummary } from "@pos/types";

export const ACCESS_LABELS: Record<UserSummary["access"], string> = {
  admin: "Admin",
  staff: "Staff",
  former: "Former staff",
};

export const ACCESS_STYLES: Record<UserSummary["access"], string> = {
  admin: "bg-ink text-white",
  staff: "bg-brand-soft text-brand-deep",
  former: "bg-surface-alt text-muted",
};

/** "3 hours ago", "yesterday", or a date for anything older than a week. */
export const ago = (iso?: string) => {
  if (!iso) return "—";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
};
