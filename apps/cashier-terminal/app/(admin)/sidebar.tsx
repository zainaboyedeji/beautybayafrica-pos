"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/inventory", label: "Inventory" },
  { href: "/sales", label: "Sales" },
  { href: "/customers", label: "Customers" },
];

export default function Sidebar() {
  const pathname = usePathname().replace(/\/$/, "") || "/";

  return (
    <aside className="flex w-56 shrink-0 flex-col bg-zinc-900 p-4 text-white">
      <p className="px-3 py-2 text-lg font-semibold">Back office</p>
      <nav className="mt-4 flex flex-col gap-1">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={pathname === link.href ? "page" : undefined}
            className={`rounded-md px-3 py-2 text-sm font-medium ${
              pathname === link.href
                ? "bg-white text-zinc-900"
                : "text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <Link
        href="/pos"
        className="mt-auto rounded-lg bg-emerald-600 px-3 py-3 text-center text-sm font-semibold hover:bg-emerald-700"
      >
        Sell products
      </Link>
    </aside>
  );
}
