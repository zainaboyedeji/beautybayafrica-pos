"use client";

import { useState } from "react";

const PAGE_SIZES = [20, 50, 100];

/**
 * Splits `items` into pages. `resetKey` should change whenever the search or
 * filters do, which sends the list back to its first page.
 */
export function usePagination<T>(
  items: T[] | null | undefined,
  resetKey: string,
) {
  const [size, setSize] = useState(PAGE_SIZES[0]);
  const [state, setState] = useState({ key: resetKey, page: 1 });
  const total = items?.length ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / size));
  // A new search or filter starts again from page 1; a shorter list can't
  // leave us past its last page.
  const page = Math.min(state.key === resetKey ? state.page : 1, pageCount);
  const start = (page - 1) * size;

  return {
    pageItems: items?.slice(start, start + size),
    /** How many items come before this page, for numbering rows. */
    start,
    page,
    pageCount,
    size,
    total,
    setPage: (next: number) => setState({ key: resetKey, page: next }),
    setSize: (next: number) => {
      setSize(next);
      setState({ key: resetKey, page: 1 });
    },
  };
}

/** Page numbers to show: the first, the last, and two either side of `page`. */
const pageNumbers = (page: number, count: number) => {
  const pages: (number | "…")[] = [];
  for (let n = 1; n <= count; n++) {
    if (n === 1 || n === count || Math.abs(n - page) <= 2) pages.push(n);
    else if (pages[pages.length - 1] !== "…") pages.push("…");
  }
  return pages;
};

const BUTTON =
  "min-w-9 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-40";

export default function Pagination({
  pager,
  label = "items",
}: {
  pager: ReturnType<typeof usePagination>;
  /** What is being counted, e.g. "products". */
  label?: string;
}) {
  const { page, pageCount, size, total, start, setPage, setSize } = pager;
  if (total === 0) return null;

  const go = (next: number) => {
    setPage(next);
    // Back to the top of the list, which is where the eye starts reading.
    document.querySelector("main")?.scrollTo({ top: 0 });
  };

  return (
    <nav
      aria-label="Pages"
      className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm"
    >
      <span className="text-muted">
        {start + 1}–{Math.min(start + size, total)} of {total} {label}
      </span>
      {pageCount > 1 && (
        <div className="flex flex-wrap items-center gap-1">
          <button
            onClick={() => go(page - 1)}
            disabled={page === 1}
            className={`${BUTTON} hover:bg-brand-soft`}
          >
            ← Previous
          </button>
          {pageNumbers(page, pageCount).map((n, i) =>
            n === "…" ? (
              <span key={`gap-${i}`} className="px-1 text-muted">
                …
              </span>
            ) : (
              <button
                key={n}
                onClick={() => go(n)}
                aria-current={n === page ? "page" : undefined}
                className={`${BUTTON} ${
                  n === page
                    ? "bg-gradient-to-r from-brand to-brand-hover text-ink shadow-md shadow-brand/30"
                    : "bg-white shadow-sm hover:bg-brand-soft"
                }`}
              >
                {n}
              </button>
            ),
          )}
          <button
            onClick={() => go(page + 1)}
            disabled={page === pageCount}
            className={`${BUTTON} hover:bg-brand-soft`}
          >
            Next →
          </button>
        </div>
      )}
      <span className="ml-auto font-medium">
        Page {page} of {pageCount}
      </span>
      <label className="flex items-center gap-2 text-muted">
        Show
        <select
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
          className="rounded-lg border border-line-strong bg-white px-2 py-1 text-ink outline-none focus:ring-2 focus:ring-brand"
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        per page
      </label>
    </nav>
  );
}
