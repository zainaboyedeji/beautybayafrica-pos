import { API_URL } from "./api";

export function LoadError() {
  return (
    <p className="rounded-lg bg-red-100 px-4 py-3 text-sm text-red-800">
      Cannot reach the sync API at {API_URL}. Is it running?
    </p>
  );
}

export function Loading() {
  return <p className="text-sm text-muted">Loading…</p>;
}
