import type { ReactNode } from "react";
import Icon, { type IconName } from "./icons";

/** The title block at the top of each back office page. */
export default function PageHeader({
  icon,
  section,
  title,
  description,
  children,
}: {
  icon: IconName;
  /** The menu group the page sits in, e.g. "Shop". */
  section: string;
  title: ReactNode;
  description?: ReactNode;
  /** Buttons shown on the right. */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="inline-flex items-center gap-2 rounded-full bg-white py-1 pl-1 pr-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-deep shadow-sm">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-hover text-ink">
            <Icon name={icon} className="h-3.5 w-3.5" />
          </span>
          {section}
        </p>
        <h1 className="mt-3 text-4xl font-semibold">{title}</h1>
        {/* A short pink stroke under the title. */}
        <span
          aria-hidden
          className="mt-2 block h-1 w-12 rounded-full bg-gradient-to-r from-brand to-brand-hover"
        />
        {description && (
          <p className="mt-3 max-w-2xl text-sm text-muted">{description}</p>
        )}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
