"use client";

import Link from "next/link";
import { useState } from "react";
import ActionModals, {
  Notice,
  type ActionModal,
} from "../components/action-modals";
import { CARD, THEAD } from "../components/form-styles";
import Icon, { type IconName } from "../components/icons";
import type { Expense, Order } from "@pos/types";
import {
  fetchCatalog,
  fetchCustomers,
  fetchExpenses,
  fetchOrders,
  money,
  sellables,
  useLoad,
} from "../lib/api";
import { useSession } from "../lib/auth";
import { LoadError, Loading } from "../lib/status";

const LOW_STOCK = 5;

const MODAL_ACTIONS: { modal: ActionModal; label: string; icon: IconName }[] =
  [
    { modal: "product", label: "Add product", icon: "plus" },
    { modal: "sale", label: "Record a sale", icon: "sales" },
    { modal: "customer", label: "Add customer", icon: "customers" },
  ];

const LINK_ACTIONS: { href: string; label: string; icon: IconName }[] = [
  { href: "/inventory", label: "Upload inventory", icon: "upload" },
];

// Each figure has its own tint, so the tiles read at a glance.
const TINTS = {
  pink: "bg-brand-soft text-brand-deep",
  violet: "bg-violet-100 text-violet-700",
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
};

/** "Good morning" and so on, by this computer's clock. */
function greeting(now: Date) {
  const hour = now.getHours();
  return hour < 12
    ? "Good morning"
    : hour < 17
      ? "Good afternoon"
      : "Good evening";
}

const DAY = 86_400_000;

// Period boundaries on this computer's calendar. Weeks start on Monday.
const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());

function periods(now: Date) {
  const today = startOfDay(now);
  const week = new Date(today.getTime() - ((today.getDay() + 6) % 7) * DAY);
  const month = new Date(now.getFullYear(), now.getMonth(), 1);
  const year = new Date(now.getFullYear(), 0, 1);
  return [
    { label: "Today", from: today, to: null },
    { label: "Yesterday", from: new Date(today.getTime() - DAY), to: today },
    { label: "This week", from: week, to: null },
    { label: "Last week", from: new Date(week.getTime() - 7 * DAY), to: week },
    { label: "This month", from: month, to: null },
    {
      label: "Last month",
      from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      to: month,
    },
    { label: "This year", from: year, to: null },
    { label: "All time", from: null, to: null },
  ];
}

type Summary = {
  sales: number;
  items: number;
  revenue: number;
  profit: number;
  expenses: number;
};

/** Sales and expenses from `from` (inclusive) up to `to` (exclusive). */
function summarise(
  orders: Order[],
  expenses: Expense[],
  from: Date | null,
  to: Date | null,
): Summary {
  const within = (at: Date) => (!from || at >= from) && (!to || at < to);
  const sold = orders.filter((o) => within(new Date(o.createdAt)));
  const lines = sold.flatMap((o) => o.items);
  return {
    sales: sold.length,
    items: lines.reduce((sum, i) => sum + i.quantity, 0),
    revenue: sold.reduce((sum, o) => sum + o.total, 0),
    // Only items sold while the product had a cost price.
    profit: lines.reduce(
      (sum, i) =>
        i.unitCost === undefined
          ? sum
          : sum + (i.unitPrice - i.unitCost) * i.quantity,
      0,
    ),
    // Expense days are calendar dates, so compare them at local midnight.
    expenses: expenses
      .filter((e) => within(new Date(`${e.spentOn}T00:00:00`)))
      .reduce((sum, e) => sum + e.amount, 0),
  };
}

/** "+12% on yesterday", or nothing when there's no yesterday to compare. */
function change(now: number, before: number) {
  if (before === 0) return now === 0 ? "Same as yesterday" : "None yesterday";
  const percent = Math.round(((now - before) / before) * 100);
  return percent === 0
    ? "Same as yesterday"
    : `${percent > 0 ? "+" : ""}${percent}% on yesterday`;
}

export default function Dashboard() {
  const catalog = useLoad(fetchCatalog);
  const orders = useLoad(fetchOrders);
  const customers = useLoad(fetchCustomers);
  const expenses = useLoad(fetchExpenses);
  const [modal, setModal] = useState<ActionModal | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const session = useSession(["admin"]);

  if (catalog.failed || orders.failed || customers.failed || expenses.failed)
    return <LoadError />;
  if (!catalog.data || !orders.data || !customers.data || !expenses.data)
    return <Loading />;

  const { products, stock } = catalog.data;
  // Refunded sales count nowhere on the dashboard.
  const sales = orders.data.filter((o) => !o.refund);
  const spent = expenses.data;

  const overview = periods(new Date()).map((p) => ({
    ...p,
    ...summarise(sales, spent, p.from, p.to),
  }));
  const [today, yesterday] = overview;
  const todayTiles = [
    {
      label: "Sales today",
      value: money.format(today.revenue),
      note: change(today.revenue, yesterday.revenue),
      icon: "coins" as IconName,
      tint: TINTS.pink,
    },
    {
      label: "Number of sales",
      value: String(today.sales),
      note: `${today.items} item${today.items === 1 ? "" : "s"} sold`,
      icon: "sales" as IconName,
      tint: TINTS.violet,
    },
    {
      label: "Gross profit today",
      value: money.format(today.profit),
      note: change(today.profit, yesterday.profit),
      icon: "trend" as IconName,
      tint: TINTS.green,
    },
    {
      label: "Spent today",
      value: money.format(today.expenses),
      note: `Net ${money.format(today.profit - today.expenses)}`,
      icon: "expenses" as IconName,
      tint: TINTS.amber,
    },
  ];

  // What's in stock, counting each option on its own. Products and options
  // without a cost price can't be valued at cost.
  const inStock = products
    .flatMap(sellables)
    .map((s) => ({
      quantity: Math.max(0, stock[s.key] ?? 0),
      price: s.price,
      cost: s.variant ? s.variant.costPrice : s.product.costPrice,
    }))
    .filter((s) => s.quantity > 0);
  const units = inStock.reduce((sum, s) => sum + s.quantity, 0);
  const atPrice = inStock.reduce((sum, s) => sum + s.quantity * s.price, 0);
  const costed = inStock.filter((s) => s.cost !== undefined);
  const atCost = costed.reduce((sum, s) => sum + s.quantity * (s.cost ?? 0), 0);
  const costedAtPrice = costed.reduce(
    (sum, s) => sum + s.quantity * s.price,
    0,
  );
  const uncosted = inStock.length - costed.length;
  // Each tile has a thin coloured edge along its top.
  const inventoryTiles = [
    {
      label: "Units in stock",
      value: units.toLocaleString(),
      accent: "from-violet-300 to-brand",
    },
    {
      label: "Stock value (selling price)",
      value: money.format(atPrice),
      accent: "from-brand to-brand-deep",
    },
    {
      label: "Stock value (cost price)",
      value: money.format(atCost),
      accent: "from-violet-400 to-brand",
    },
    {
      label: "Profit if it all sells",
      value: money.format(costedAtPrice - atCost),
      accent: "from-emerald-400 to-emerald-600",
    },
  ];

  // Each option counts on its own, so one shade running out shows up.
  const lowStock = products
    .flatMap(sellables)
    .filter((s) => (stock[s.key] ?? 0) <= LOW_STOCK);

  const now = new Date();

  return (
    <div className="mx-auto max-w-6xl">
      {/* The pink hero: who's here, today's date, and the everyday actions. */}
      <section className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-brand-deep via-brand-hover to-brand px-8 pb-20 pt-8 text-white shadow-2xl shadow-brand/30">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-28 h-80 w-80 animate-drift rounded-full bg-white/25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 right-40 h-72 w-72 rounded-full bg-violet-300/25 blur-3xl"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80">
              {now.toLocaleDateString("en-NG", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
            <h1 className="mt-2 text-4xl font-semibold">
              {greeting(now)},{" "}
              <span className="italic text-brand-soft">
                {session?.name.split(" ")[0] ?? "there"}
              </span>
            </h1>
            <p className="mt-2 max-w-md text-sm text-white/85">
              {today.sales === 0
                ? "No sales yet today. The till is ready when you are."
                : `${today.sales} sale${today.sales === 1 ? "" : "s"} so far today, ${money.format(today.revenue)} taken.`}
            </p>
          </div>
          <Link
            href="/pos"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-brand-deep shadow-lg shadow-brand-deep/25 transition hover:-translate-y-px"
          >
            <Icon name="sell" />
            Open the till
          </Link>
        </div>
        <div className="relative mt-6 flex flex-wrap gap-2">
          {MODAL_ACTIONS.map((action) => (
            <button
              key={action.label}
              onClick={() => setModal(action.modal)}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium text-ink shadow-sm transition hover:-translate-y-px hover:shadow-md"
            >
              <Icon name={action.icon} className="h-4 w-4 text-brand-deep" />
              {action.label}
            </button>
          ))}
          {LINK_ACTIONS.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium text-ink shadow-sm transition hover:-translate-y-px hover:shadow-md"
            >
              <Icon name={action.icon} className="h-4 w-4 text-brand-deep" />
              {action.label}
            </Link>
          ))}
        </div>
      </section>

      {/* Today's figures, tucked over the hero's bottom edge. */}
      <div className="relative -mt-12 grid grid-cols-2 gap-4 px-4 lg:grid-cols-4">
        {todayTiles.map((tile) => (
          <div
            key={tile.label}
            className={`${CARD} transition hover:-translate-y-0.5`}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted">{tile.label}</p>
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-xl ${tile.tint}`}
              >
                <Icon name={tile.icon} className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {tile.value}
            </p>
            <p
              className={`mt-1 text-xs ${
                tile.note.startsWith("+")
                  ? "font-medium text-emerald-700"
                  : tile.note.startsWith("-")
                    ? "font-medium text-red-700"
                    : "text-muted"
              }`}
            >
              {tile.note}
            </p>
          </div>
        ))}
      </div>

      <Notice text={notice} />
      <ActionModals
        open={modal}
        onClose={() => setModal(null)}
        onSaved={(message) => {
          setModal(null);
          setNotice(message);
          void catalog.reload();
          void orders.reload();
          void customers.reload();
          void expenses.reload();
        }}
      />

      <SectionTitle title="Sales overview" />
      <div className="mt-3 overflow-x-auto rounded-2xl bg-white shadow-soft ring-1 ring-line">
        <table className="w-full text-left text-sm">
          <thead className={THEAD}>
            <tr>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3 text-right">Sales</th>
              <th className="px-4 py-3 text-right">Items sold</th>
              <th className="px-4 py-3 text-right">Revenue</th>
              <th className="px-4 py-3 text-right">Average sale</th>
              <th className="px-4 py-3 text-right">Gross profit</th>
              <th className="px-4 py-3 text-right">Expenses</th>
              <th className="px-4 py-3 text-right">Net</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line tabular-nums">
            {overview.map((row) => {
              const net = row.profit - row.expenses;
              return (
                <tr
                  key={row.label}
                  className={
                    row.label === "All time"
                      ? "bg-brand-soft/30 font-medium"
                      : undefined
                  }
                >
                  <td className="whitespace-nowrap px-4 py-3 font-medium">
                    {row.label}
                  </td>
                  <td className="px-4 py-3 text-right">{row.sales}</td>
                  <td className="px-4 py-3 text-right">{row.items}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-medium">
                    {money.format(row.revenue)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {row.sales ? money.format(row.revenue / row.sales) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {money.format(row.profit)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {money.format(row.expenses)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <span
                      className={`rounded-full px-2 py-0.5 font-semibold ${
                        net < 0
                          ? "bg-red-50 text-red-700"
                          : net > 0
                            ? "bg-emerald-50 text-emerald-800"
                            : ""
                      }`}
                    >
                      {money.format(net)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        Gross profit counts only items sold while the product had a cost price.
        Net is gross profit minus expenses. Weeks start on Monday.
      </p>

      <SectionTitle
        title="Inventory value"
        detail={`${products.length} products · ${customers.data.length} customers`}
      />
      <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {inventoryTiles.map((tile) => (
          <div key={tile.label} className={`${CARD} relative overflow-hidden`}>
            <span
              aria-hidden
              className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${tile.accent}`}
            />
            <p className="text-sm text-muted">{tile.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {tile.value}
            </p>
          </div>
        ))}
      </div>
      {uncosted > 0 && (
        <p className="mt-2 text-xs text-muted">
          {uncosted} product{uncosted === 1 ? "" : "s"} or option
          {uncosted === 1 ? "" : "s"} in stock {uncosted === 1 ? "has" : "have"}{" "}
          no cost price, so {uncosted === 1 ? "it isn't" : "they aren't"}{" "}
          counted in the cost value or profit. Add cost prices in{" "}
          <Link href="/inventory" className="underline hover:text-brand-deep">
            Inventory
          </Link>
          .
        </p>
      )}

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <section className={CARD}>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Recent sales</h2>
            <Link
              href="/sales"
              className="text-sm font-medium text-brand-deep hover:underline"
            >
              All sales →
            </Link>
          </div>
          {sales.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No sales recorded yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line text-sm">
              {sales
                .slice(-5)
                .reverse()
                .map((order) => (
                  <li key={order.id} className="flex items-center gap-3 py-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-soft to-violet-100 text-xs font-semibold text-brand-deep">
                      {initials(order.customer.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {order.customer.name}
                      </span>
                      <span className="block text-xs text-muted">
                        {new Date(order.createdAt).toLocaleString()}
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums">
                      {money.format(order.total)}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </section>

        <section className={CARD}>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Low stock</h2>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
              {LOW_STOCK} or fewer left
            </span>
          </div>
          {lowStock.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nothing is running low.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line text-sm">
              {lowStock.slice(0, 8).map((s) => {
                const left = stock[s.key] ?? 0;
                return (
                  <li key={s.key} className="flex items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    {/* How close to empty, out of LOW_STOCK. */}
                    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-line">
                      <span
                        className={`block h-full rounded-full ${
                          left <= 0 ? "bg-red-500" : "bg-amber-400"
                        }`}
                        style={{
                          width: `${Math.max(8, (Math.max(0, left) / LOW_STOCK) * 100)}%`,
                        }}
                      />
                    </span>
                    <span
                      className={`w-14 text-right font-medium ${
                        left <= 0 ? "text-red-700" : ""
                      }`}
                    >
                      {left <= 0 ? "Out" : `${left} left`}
                    </span>
                  </li>
                );
              })}
              {lowStock.length > 8 && (
                <li className="py-2 text-muted">
                  …and {lowStock.length - 8} more
                </li>
              )}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function SectionTitle({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="mt-10 flex items-baseline gap-3">
      <h2 className="text-2xl font-semibold">{title}</h2>
      {detail && <span className="text-sm text-muted">{detail}</span>}
    </div>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
