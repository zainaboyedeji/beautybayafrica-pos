"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { Order } from "@pos/types";
import ActivityLog from "../../components/activity-log";
import Pagination, { usePagination } from "../../components/pagination";
import {
  ACCESS_LABELS,
  ACCESS_STYLES,
  ago,
} from "../../components/user-labels";
import { fetchUserOrders, fetchUsers, money, useLoad } from "../../lib/api";
import { LoadError, Loading } from "../../lib/status";
import { CARD, TABLE, TABLE_CARD, THEAD } from "../../components/form-styles";
import PageHeader from "../../components/page-header";

// The user's id comes from the address (?id=…), which is only known in the
// browser, so the page waits for it inside Suspense.
export default function UserPage() {
  return (
    <Suspense fallback={<Loading />}>
      <UserHistory />
    </Suspense>
  );
}

/** One user's details, the sales they made, and everything they did. */
function UserHistory() {
  const id = useSearchParams().get("id") ?? "";
  const users = useLoad(fetchUsers);
  const user = users.data?.find((u) => u.id === id);
  const [tab, setTab] = useState<"activity" | "sales">("activity");

  if (users.failed) return <LoadError />;
  if (!users.data) return <Loading />;
  if (!user)
    return (
      <div className="mx-auto max-w-6xl">
        <BackLink />
        <p className="mt-4 text-sm text-muted">
          This user wasn&apos;t found. They may have been removed before they
          did anything.
        </p>
      </div>
    );

  const tiles = [
    { label: "Last login", value: ago(user.lastLogin), title: user.lastLogin },
    {
      label: "Last activity",
      value: ago(user.lastActivity),
      title: user.lastActivity,
    },
    { label: "Sales made", value: String(user.sales) },
    { label: "Sales total", value: money.format(user.salesTotal) },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <BackLink />
      <div className="mt-4">
        <PageHeader
          icon="users"
          section="Team · User"
          title={
            <span className="flex flex-wrap items-center gap-3">
              {user.name}
              <span
                className={`rounded-full px-2.5 py-0.5 font-sans text-xs font-medium ${ACCESS_STYLES[user.access]}`}
              >
                {ACCESS_LABELS[user.access]}
              </span>
            </span>
          }
          description={
            [
              user.jobRole,
              user.createdAt &&
                `Added ${new Date(user.createdAt).toLocaleDateString()}`,
            ]
              .filter(Boolean)
              .join(" · ") ||
            (user.access === "admin"
              ? "Logs in with the admin password"
              : "No longer has a login")
          }
        />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <div
            key={t.label}
            className={CARD}
            title={t.title ? new Date(t.title).toLocaleString() : undefined}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              {t.label}
            </p>
            <p className="mt-2 text-2xl font-semibold">{t.value}</p>
          </div>
        ))}
      </div>

      <div
        role="tablist"
        className="mt-8 flex gap-1 border-b border-line text-sm font-medium"
      >
        {(
          [
            ["activity", "Activity"],
            ["sales", `Sales (${user.sales})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2 ${
              tab === key
                ? "border-brand text-brand-deep"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "activity" ? (
          <ActivityLog user={user.id} />
        ) : (
          <UserSales user={user.id} />
        )}
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/users"
      className="text-sm font-medium text-brand-deep hover:underline"
    >
      ← All users
    </Link>
  );
}

/** The sales one user made, newest first. */
function UserSales({ user }: { user: string }) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    fetchUserOrders(user)
      .then((data) => {
        if (current) setOrders([...data].reverse());
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [user]);

  const pager = usePagination(orders, user);

  if (failed) return <LoadError />;
  if (!orders) return <Loading />;
  if (orders.length === 0)
    return (
      <p className="text-sm text-muted">
        No sales recorded for this user. Sales are linked to whoever made them
        from this update on; older sales don&apos;t show here.
      </p>
    );

  return (
    <>
      <div className={TABLE_CARD}>
        <table className={TABLE}>
          <thead className={THEAD}>
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {pager.pageItems?.map((order) => (
              <tr key={order.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3">
                  {new Date(order.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <span className="font-medium">{order.customer.name}</span>
                  <span className="block text-xs text-muted">
                    {order.customer.phone}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {order.items
                    .map((i) => `${i.quantity} × ${i.name ?? "Removed product"}`)
                    .join(", ")}
                </td>
                <td className="px-4 py-3 capitalize">{order.paymentMethod}</td>
                <td className="px-4 py-3 text-right font-medium">
                  {money.format(order.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination pager={pager} label="sales" />
    </>
  );
}
