"use client";

import Link from "next/link";
import { useState } from "react";
import ActionModals, {
  Notice,
  type ActionModal,
} from "../components/action-modals";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "../components/form-styles";
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
import { LoadError, Loading } from "../lib/status";

const LOW_STOCK = 5;

const MODAL_ACTIONS: { modal: ActionModal; label: string }[] = [
  { modal: "product", label: "Add product" },
  { modal: "sale", label: "Record a sale" },
  { modal: "customer", label: "Add customer" },
];

const LINK_ACTIONS = [
  { href: "/pos", label: "Sell products" },
  { href: "/inventory", label: "Upload inventory" },
];

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

  if (catalog.failed || orders.failed || customers.failed || expenses.failed)
    return <LoadError />;
  if (!catalog.data || !orders.data || !customers.data || !expenses.data)
    return <Loading />;

  const { products, stock } = catalog.data;
  const sales = orders.data;
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
    },
    {
      label: "Number of sales",
      value: String(today.sales),
      note: `${today.items} item${today.items === 1 ? "" : "s"} sold`,
    },
    {
      label: "Gross profit today",
      value: money.format(today.profit),
      note: change(today.profit, yesterday.profit),
    },
    {
      label: "Spent today",
      value: money.format(today.expenses),
      note: `Net ${money.format(today.profit - today.expenses)}`,
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
  const inventoryTiles = [
    { label: "Units in stock", value: units.toLocaleString() },
    { label: "Stock value (selling price)", value: money.format(atPrice) },
    { label: "Stock value (cost price)", value: money.format(atCost) },
    {
      label: "Profit if it all sells",
      value: money.format(costedAtPrice - atCost),
    },
  ];

  // Each option counts on its own, so one shade running out shows up.
  const lowStock = products
    .flatMap(sellables)
    .filter((s) => (stock[s.key] ?? 0) <= LOW_STOCK);

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-3xl font-semibold">Dashboard</h1>

      <h2 className="mt-8 font-sans text-sm font-medium text-muted">
        Quick actions
      </h2>
      <div className="mt-3 flex flex-wrap gap-3">
        {MODAL_ACTIONS.map((action) => (
          <button
            key={action.label}
            onClick={() => setModal(action.modal)}
            className={
              action.modal === "product" ? PRIMARY_BUTTON : SECONDARY_BUTTON
            }
          >
            {action.label}
          </button>
        ))}
        {LINK_ACTIONS.map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className={SECONDARY_BUTTON}
          >
            {action.label}
          </Link>
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

      <h2 className="mt-10 font-sans text-sm font-medium text-muted">
        Today ·{" "}
        {new Date().toLocaleDateString("en-NG", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {todayTiles.map((tile) => (
          <div
            key={tile.label}
            className="rounded-lg border-l-4 border-brand bg-white p-5 shadow-sm"
          >
            <p className="text-sm text-muted">{tile.label}</p>
            <p className="mt-1 text-2xl font-semibold">{tile.value}</p>
            <p className="mt-1 text-xs text-muted">{tile.note}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-10 font-sans text-sm font-medium text-muted">
        Sales overview
      </h2>
      <div className="mt-3 overflow-x-auto rounded-lg bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-alt text-xs uppercase tracking-wide text-muted">
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
                    row.label === "All time" ? "bg-surface-alt/60" : undefined
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
                  <td
                    className={`whitespace-nowrap px-4 py-3 text-right font-medium ${
                      net < 0 ? "text-red-700" : ""
                    }`}
                  >
                    {money.format(net)}
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

      <h2 className="mt-10 font-sans text-sm font-medium text-muted">
        Inventory value · {products.length} products, {customers.data.length}{" "}
        customers
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {inventoryTiles.map((tile) => (
          <div
            key={tile.label}
            className="rounded-lg border-l-4 border-ink bg-white p-5 shadow-sm"
          >
            <p className="text-sm text-muted">{tile.label}</p>
            <p className="mt-1 text-2xl font-semibold">{tile.value}</p>
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
        <section className="rounded-lg bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Recent sales</h2>
          {sales.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No sales recorded yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line text-sm">
              {sales
                .slice(-5)
                .reverse()
                .map((order) => (
                  <li key={order.id} className="flex justify-between py-2">
                    <span>
                      {order.customer.name}
                      <span className="ml-2 text-muted">
                        {new Date(order.createdAt).toLocaleString()}
                      </span>
                    </span>
                    <span className="font-medium">
                      {money.format(order.total)}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg bg-white p-5 shadow-sm">
          <h2 className="font-semibold">
            Low stock ({LOW_STOCK} or fewer left)
          </h2>
          {lowStock.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nothing is running low.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line text-sm">
              {lowStock.slice(0, 8).map((s) => (
                <li key={s.key} className="flex justify-between py-2">
                  <span>{s.name}</span>
                  <span className="font-medium">{stock[s.key] ?? 0} left</span>
                </li>
              ))}
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
