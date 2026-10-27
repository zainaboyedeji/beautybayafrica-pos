import { API_URL } from "./api";

export function LoadError() {
  return (
    <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-100">
      Cannot reach the sync API at {API_URL}. Is it running?
    </p>
  );
}

export function Loading() {
  return (
    <p className="flex items-center gap-2.5 text-sm text-muted">
      <span
        aria-hidden
        className="h-4 w-4 animate-spin rounded-full border-2 border-brand-soft border-t-brand"
      />
      Loading…
    </p>
  );
}
