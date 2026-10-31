import Link from "next/link";
import type { ReactNode } from "react";
import { logOut } from "../lib/auth";
import Icon, { type IconName } from "./icons";

const BAR_LINK =
  "relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-ink/80 transition hover:bg-white/35 hover:text-ink";

/** The pink bar across the top of the till and the staff Requests page. */
export default function TopBar({
  title,
  links,
  name,
  children,
}: {
  /** The page name; the last word is set in pink italics. */
  title: string;
  links: { href: string; label: string; icon: IconName }[];
  /** Who is logged in. */
  name?: string;
  /** Shown on the right, before the user's name (e.g. a search box). */
  children?: ReactNode;
}) {
  const words = title.split(" ");
  const last = words.pop();
  return (
    <header className="relative flex flex-wrap items-center gap-3 overflow-hidden lg:flex-nowrap rounded-2xl bg-gradient-to-r from-brand to-brand-hover px-4 py-3 text-ink shadow-xl shadow-brand/30 print:hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 left-1/3 h-40 w-72 rounded-full bg-white/25 blur-3xl"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt=""
        className="relative h-9 w-9 rounded-xl bg-white p-0.5"
      />
      <h1 className="relative mr-2 text-xl font-semibold">
        {words.length > 0 && `${words.join(" ")} `}
        <span className="italic text-white">{last}</span>
      </h1>
      {links.map((link) => (
        <Link key={link.href} href={link.href} className={BAR_LINK}>
          <Icon name={link.icon} className="h-4 w-4" />
          {/* Icons only on phones, to fit on one line. */}
          <span className="sr-only sm:not-sr-only">{link.label}</span>
        </Link>
      ))}
      {/* On phones the search box drops onto its own line underneath. */}
      {children && (
        <div className="relative order-last flex w-full items-center gap-3 sm:order-none sm:ml-auto sm:w-auto">
          {children}
        </div>
      )}
      <div
        className={`relative flex items-center gap-3 ${children ? "ml-auto sm:ml-0" : "ml-auto"}`}
      >
        {name && (
          <span className="hidden items-center gap-2 rounded-xl bg-white py-1 pl-1 pr-3 text-sm font-medium shadow-sm sm:flex">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand-hover text-xs font-bold text-ink">
              {name.charAt(0).toUpperCase()}
            </span>
            {name}
          </span>
        )}
        <button
          onClick={logOut}
          aria-label="Log out"
          title="Log out"
          className={`${BAR_LINK} px-2`}
        >
          <Icon name="logOut" className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
