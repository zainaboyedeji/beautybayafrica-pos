"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Icon, { type IconName } from "../components/icons";
import { fetchRequests, useLoad } from "../lib/api";
import { logOut, useSession } from "../lib/auth";

const GROUPS: {
  label: string;
  links: { href: string; label: string; icon: IconName }[];
}[] = [
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
      { href: "/gifts", label: "Free gifts", icon: "gift" },
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
  const session = useSession(["admin"]);
  const requests = useLoad(fetchRequests);
  const { reload } = requests;
  // Check for new requests whenever the admin moves to another page.
  useEffect(() => {
    void reload();
  }, [pathname, reload]);
  const pending =
    requests.data?.filter((r) => r.status === "pending").length ?? 0;
  // On phones the menu slides in from the left when asked for.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* The bar across the top on phones, in place of the menu. */}
      <header className="flex shrink-0 items-center gap-3 rounded-2xl bg-gradient-to-r from-brand to-brand-hover px-3 py-2 text-ink shadow-xl shadow-brand/30 lg:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="flex h-9 w-9 items-center justify-center rounded-lg transition hover:bg-white/35"
        >
          <Icon name="menu" className="h-5 w-5" />
        </button>
        <Link
          href="/"
          className="flex items-center gap-2"
          aria-label="Dashboard"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt=""
            className="h-8 w-8 rounded-xl bg-white p-0.5"
          />
          <span className="font-display text-lg font-semibold">
            Beauty Bay
          </span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          {pending > 0 && (
            <Link
              href="/requests"
              aria-label={`${pending} pending requests`}
              className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-brand-deep shadow-sm"
            >
              {pending}
            </Link>
          )}
          <Link
            href="/pos"
            className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-sm font-semibold shadow-sm"
          >
            <Icon name="sell" className="h-4 w-4" />
            Sell
          </Link>
        </div>
      </header>

      {open && (
        <div
          aria-hidden
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-ink/25 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        // Picking a page closes the menu on phones.
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) setOpen(false);
        }}
        className={`fixed inset-y-3 left-3 z-50 flex w-64 shrink-0 flex-col overflow-hidden rounded-[1.75rem] transition-transform duration-200 lg:relative lg:inset-auto lg:z-auto lg:translate-none lg:transition-none ${
          open ? "translate-x-0" : "-translate-x-[110%]"
        } bg-gradient-to-b from-brand to-brand-hover text-ink shadow-2xl shadow-brand/30`}
      >
        {/* Soft glows, low in the panel. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 animate-drift rounded-full bg-white/25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-10 right-[-4rem] h-48 w-48 rounded-full bg-violet-300/25 blur-3xl"
        />

        <Link
          href="/"
          className="relative flex items-center gap-3 px-5 pb-2 pt-6"
          aria-label="Dashboard"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt=""
            className="h-11 w-11 rounded-2xl bg-white p-1 shadow-lg shadow-brand-deep/20"
          />
          <span className="leading-tight">
            <span className="block font-display text-lg font-semibold">
              Beauty Bay
            </span>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-ink/70">
              Back office
            </span>
          </span>
        </Link>
        <button
          onClick={() => setOpen(false)}
          aria-label="Close menu"
          className="absolute right-3 top-6 flex h-9 w-9 items-center justify-center rounded-lg transition hover:bg-white/35 lg:hidden"
        >
          <Icon name="close" className="h-5 w-5" />
        </button>

        <nav className="relative mt-4 flex-1 overflow-y-auto px-3 pb-4">
          {GROUPS.map((group) => (
            <div key={group.label} className="mt-5 first:mt-0">
              <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink/55">
                {group.label}
              </p>
              <div className="flex flex-col gap-1">
                {group.links.map((link) => {
                  const active = isActive(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      aria-current={active ? "page" : undefined}
                      className={`group flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm font-medium transition ${
                        active
                          ? "bg-white text-ink shadow-md shadow-brand-deep/20"
                          : "text-ink/80 hover:bg-white/35 hover:text-ink"
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-lg transition group-hover:scale-105 ${
                          active
                            ? "bg-gradient-to-br from-brand to-brand-hover text-ink shadow-md shadow-brand/30"
                            : "bg-white text-brand-deep shadow-sm"
                        }`}
                      >
                        <Icon name={link.icon} className="h-4 w-4" />
                      </span>
                      {link.label}
                      {link.href === "/requests" && pending > 0 && (
                        <span
                          aria-label={`${pending} pending`}
                          className="ml-auto rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-ink"
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

        <div className="relative m-3 rounded-2xl bg-white p-3 shadow-lg shadow-brand-deep/20">
          <Link
            href="/pos"
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand-hover px-3 py-2.5 text-sm font-semibold text-ink shadow-md shadow-brand/30 transition hover:-translate-y-px hover:brightness-105"
          >
            <Icon name="sell" />
            Sell products
          </Link>
          <div className="mt-3 flex items-center justify-between gap-2 px-1">
            <span className="min-w-0">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                Logged in
              </span>
              <span className="block truncate text-sm font-medium">
                {session?.name ?? "Admin"}
              </span>
            </span>
            <button
              onClick={logOut}
              aria-label="Log out"
              title="Log out"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-brand-soft hover:text-ink"
            >
              <Icon name="logOut" className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
