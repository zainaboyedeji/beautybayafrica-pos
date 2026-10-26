"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { fetchRequests, useLoad } from "../lib/api";
import { logOut } from "../lib/auth";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/inventory", label: "Inventory" },
  { href: "/sales", label: "Sales" },
  { href: "/customers", label: "Customers" },
  { href: "/suppliers", label: "Suppliers" },
  { href: "/expenses", label: "Expenses" },
  { href: "/requests", label: "Requests" },
  { href: "/staff", label: "Staff" },
];

export default function Sidebar() {
  const pathname = usePathname().replace(/\/$/, "") || "/";
  const requests = useLoad(fetchRequests);
  const { reload } = requests;
  // Check for new requests whenever the admin moves to another page.
  useEffect(() => {
    void reload();
  }, [pathname, reload]);
  const pending =
    requests.data?.filter((r) => r.status === "pending").length ?? 0;

  return (
    <aside className="flex w-56 shrink-0 flex-col bg-ink p-4 text-white">
      <p className="px-3 py-2 text-lg font-semibold">Back office</p>
      <nav className="mt-4 flex flex-col gap-1">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={pathname === link.href ? "page" : undefined}
            className={`flex items-center rounded-md px-3 py-2 text-sm font-medium ${
              pathname === link.href
                ? "bg-brand text-ink"
                : "text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            {link.label}
            {link.href === "/requests" && pending > 0 && (
              <span
                aria-label={`${pending} pending`}
                className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${
                  pathname === link.href
                    ? "bg-white text-brand-deep"
                    : "bg-brand text-ink"
                }`}
              >
                {pending}
              </span>
            )}
          </Link>
        ))}
      </nav>
      <Link
        href="/pos"
        className="mt-auto rounded-lg bg-brand px-3 py-3 text-center text-sm font-semibold text-ink hover:bg-brand-hover"
      >
        Sell products
      </Link>
      <button
        onClick={logOut}
        className="mt-2 rounded-md px-3 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
      >
        Log out
      </button>
    </aside>
  );
}
