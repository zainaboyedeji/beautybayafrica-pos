"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { fetchRequests, useLoad } from "../lib/api";
import { logOut } from "../lib/auth";

// Line icons drawn on a 24×24 grid, in the style of the Lucide set.
const ICONS: Record<string, ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  activity: (
    <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
  ),
  inventory: (
    <>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="M3.3 7 12 12l8.7-5" />
      <path d="M12 22V12" />
    </>
  ),
  sales: (
    <>
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
      <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
      <path d="M12 17.5v-11" />
    </>
  ),
  customers: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  expenses: (
    <>
      <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
      <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
    </>
  ),
  suppliers: (
    <>
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
      <path d="M15 18H9" />
      <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
      <circle cx="17" cy="18" r="2" />
      <circle cx="7" cy="18" r="2" />
    </>
  ),
  storeItems: (
    <>
      <path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      <rect x="2" y="6" width="20" height="14" rx="2" />
    </>
  ),
  requests: (
    <>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </>
  ),
  staff: (
    <>
      <path d="M16 2v2" />
      <path d="M8 2v2" />
      <path d="M7 22v-2a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" />
      <circle cx="12" cy="11" r="3" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
    </>
  ),
  users: (
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="10" r="3" />
      <path d="M7 20.66V19a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1.66" />
    </>
  ),
  sell: (
    <>
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </>
  ),
  logOut: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
};

function Icon({ name }: { name: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {ICONS[name]}
    </svg>
  );
}

const GROUPS = [
  {
    label: "Overview",
    links: [
      { href: "/", label: "Dashboard", icon: "dashboard" },
      { href: "/activity", label: "Activity", icon: "activity" },
    ],
  },
  {
    label: "Shop",
    links: [
      { href: "/inventory", label: "Inventory", icon: "inventory" },
      { href: "/sales", label: "Sales", icon: "sales" },
      { href: "/customers", label: "Customers", icon: "customers" },
    ],
  },
  {
    label: "Money",
    links: [
      { href: "/expenses", label: "Expenses", icon: "expenses" },
      { href: "/suppliers", label: "Suppliers", icon: "suppliers" },
      { href: "/store-items", label: "Store items", icon: "storeItems" },
    ],
  },
  {
    label: "Team",
    links: [
      { href: "/requests", label: "Requests", icon: "requests" },
      { href: "/staff", label: "Staff", icon: "staff" },
      { href: "/users", label: "Users", icon: "users" },
    ],
  },
];

// A user's history page belongs under Users.
const SECTION_OF: Record<string, string> = { "/user": "/users" };

export default function Sidebar() {
  const pathname = usePathname().replace(/\/$/, "") || "/";
  const isActive = (href: string) =>
    (SECTION_OF[pathname] ?? pathname) === href;
  const requests = useLoad(fetchRequests);
  const { reload } = requests;
  // Check for new requests whenever the admin moves to another page.
  useEffect(() => {
    void reload();
  }, [pathname, reload]);
  const pending =
    requests.data?.filter((r) => r.status === "pending").length ?? 0;

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-ink text-white">
      <Link
        href="/"
        className="flex items-center gap-3 px-6 pb-2 pt-6"
        aria-label="Dashboard"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" className="h-11 w-11" />
        <span className="leading-tight">
          <span className="block text-sm font-semibold">Beauty Bay Africa</span>
          <span className="block text-xs text-zinc-400">Back office</span>
        </span>
      </Link>

      <nav className="mt-4 flex-1 overflow-y-auto px-3 pb-4">
        {GROUPS.map((group) => (
          <div key={group.label} className="mt-4 first:mt-0">
            <p className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">
              {group.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.links.map((link) => {
                const active = isActive(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? "bg-white/10 text-white"
                        : "text-zinc-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {active && (
                      <span
                        aria-hidden
                        className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-brand"
                      />
                    )}
                    <span className={active ? "text-brand" : undefined}>
                      <Icon name={link.icon} />
                    </span>
                    {link.label}
                    {link.href === "/requests" && pending > 0 && (
                      <span
                        aria-label={`${pending} pending`}
                        className="ml-auto rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-ink"
                      >
                        {pending}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <Link
          href="/pos"
          className="flex items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2.5 text-sm font-semibold text-ink shadow-[0_4px_14px_-4px_rgb(248_71_180/0.6)] transition hover:bg-brand-hover"
        >
          <Icon name="sell" />
          Sell products
        </Link>
        <button
          onClick={logOut}
          className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
        >
          <Icon name="logOut" />
          Log out
        </button>
      </div>
    </aside>
  );
}
