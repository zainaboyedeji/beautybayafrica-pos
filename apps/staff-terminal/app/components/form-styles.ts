export const INPUT =
  "mt-1 w-full rounded-xl border border-line-strong bg-white px-3.5 py-2.5 font-normal outline-none transition placeholder:text-muted/70 hover:border-brand/40 focus:border-brand focus:ring-4 focus:ring-brand/20";

/** A filter dropdown next to a search box. */
export const SELECT =
  "rounded-xl border border-line-strong bg-white px-3.5 py-2.5 text-sm outline-none transition hover:border-brand/40 focus:border-brand focus:ring-4 focus:ring-brand/20";

// The POS's buttons are softly squared (not pills, like the HR app), and the
// main one glows with a pink gradient.
export const PRIMARY_BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand-hover px-5 py-2.5 text-sm font-semibold text-ink shadow-md shadow-brand/30 transition hover:-translate-y-px hover:brightness-105 active:translate-y-0 disabled:translate-y-0 disabled:opacity-40 disabled:shadow-none";

export const SECONDARY_BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-line-strong bg-white px-5 py-2.5 text-sm font-semibold transition hover:-translate-y-px hover:border-brand/40 hover:bg-brand-soft/50 active:translate-y-0 disabled:translate-y-0 disabled:opacity-40";


/** A white panel floating on the cream page. */
export const CARD = "rounded-2xl bg-white p-5 shadow-soft ring-1 ring-line";

// Tables sit in a CARD-like frame with a warm header.
export const TABLE_CARD =
  "overflow-x-auto rounded-2xl bg-white shadow-soft ring-1 ring-line";
export const TABLE = "w-full text-left text-sm";
export const THEAD =
  "bg-surface-alt/80 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-deep/70";
