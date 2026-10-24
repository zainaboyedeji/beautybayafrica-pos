"use client";

import Link from "next/link";
import { useState } from "react";
import ActionModals, {
  Notice,
  type ActionModal,
} from "../components/action-modals";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "../components/form-styles";
import {
  fetchCatalog,
  fetchCustomers,
  fetchOrders,
  money,
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

export default function Dashboard() {
  const catalog = useLoad(fetchCatalog);
  const orders = useLoad(fetchOrders);
  const customers = useLoad(fetchCustomers);
  const [modal, setModal] = useState<ActionModal | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (catalog.failed || orders.failed || customers.failed)
    return <LoadError />;
  if (!catalog.data || !orders.data || !customers.data) return <Loading />;

  const { products, stock } = catalog.data;
  const sales = orders.data;

  const grossSales = sales.reduce((sum, o) => sum + o.total, 0);
  const costedItems = sales
    .flatMap((o) => o.items)
    .filter((i) => i.unitCost !== undefined);
  const grossProfit = costedItems.reduce(
    (sum, i) => sum + (i.unitPrice - (i.unitCost ?? 0)) * i.quantity,
    0,
  );
  const lowStock = products.filter((p) => (stock[p.id] ?? 0) <= LOW_STOCK);

  const tiles = [
    { label: "Gross sales", value: money.format(grossSales) },
    { label: "Gross profit", value: money.format(grossProfit) },
    { label: "No. of sales", value: String(sales.length) },
    {
      label: "Average sale",
      value: money.format(sales.length ? grossSales / sales.length : 0),
    },
    {
      label: "No. of customers",
      value: String(customers.data.length),
    },
    { label: "Products", value: String(products.length) },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-3xl font-semibold">Dashboard</h1>

      <h2 className="mt-8 font-sans text-sm font-medium text-muted">Quick actions</h2>
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
          <Link key={action.label} href={action.href} className={SECONDARY_BUTTON}>
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
        }}
      />

      <h2 className="mt-10 font-sans text-sm font-medium text-muted">
        Analytics · all time
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-3">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="rounded-lg border-l-4 border-brand bg-white p-5 shadow-sm"
          >
            <p className="text-sm text-muted">{tile.label}</p>
            <p className="mt-1 text-2xl font-semibold">{tile.value}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">
        Gross profit counts only items sold while the product had a cost price.
      </p>

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
            <p className="mt-3 text-sm text-muted">
              Nothing is running low.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line text-sm">
              {lowStock.slice(0, 8).map((p) => (
                <li key={p.id} className="flex justify-between py-2">
                  <span>{p.name}</span>
                  <span className="font-medium">{stock[p.id] ?? 0} left</span>
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
