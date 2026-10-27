"use client";

import Link from "next/link";
import { useState } from "react";
import type { Order, SaleChannel } from "@pos/types";
import ActionModals, {
  Notice,
  type ActionModal,
} from "../../components/action-modals";
import {
  PRIMARY_BUTTON,
  SELECT,
  TABLE,
  TABLE_CARD,
  THEAD,
} from "../../components/form-styles";
import Pagination, { usePagination } from "../../components/pagination";
import SearchBox, { matches, NoMatches } from "../../components/search-box";
import { fetchCatalog, fetchOrders, money, useLoad } from "../../lib/api";
import { LoadError, Loading } from "../../lib/status";
import PageHeader from "../../components/page-header";

const CHANNEL_FILTERS: Record<"" | SaleChannel, string> = {
  "": "Online and offline",
  offline: "Offline only",
  online: "Online only",
};

function ChannelBadge({ channel }: { channel: SaleChannel }) {
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
        channel === "online"
          ? "bg-sky-100 text-sky-800"
          : "bg-surface-alt text-muted"
      }`}
    >
      {channel === "online" ? "Online" : "Offline"}
    </span>
  );
}

export default function SalesPage() {
  const orders = useLoad(fetchOrders);
  const catalog = useLoad(fetchCatalog);
  const [modal, setModal] = useState<ActionModal | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState<"" | SaleChannel>("");

  const productName = (id: string) =>
    catalog.data?.products.find((p) => p.id === id)?.name ?? "Removed product";

  const itemsText = (order: Order) =>
    order.items
      .map((i) => `${i.quantity} × ${i.name ?? productName(i.productId)}`)
      .join(", ");

  const visible = orders.data
    ? [...orders.data]
        .reverse()
        .filter(
          (order) =>
            (!channel || order.channel === channel) &&
            matches(
            search,
            order.customer.name,
            order.customer.phone,
            order.paymentMethod,
            order.soldBy?.name,
            itemsText(order),
          ),
        )
    : null;

  const pager = usePagination(visible, JSON.stringify([search, channel]));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader icon="sales" section="Shop" title="Sales">
        <button onClick={() => setModal("sale")} className={PRIMARY_BUTTON}>
          Record sale
        </button>
      </PageHeader>
      <Notice text={notice} />
      <ActionModals
        open={modal}
        onClose={() => setModal(null)}
        onSaved={(message) => {
          setModal(null);
          setNotice(message);
          void orders.reload();
          void catalog.reload();
        }}
      />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="min-w-64 flex-1">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search by customer, phone, item or payment"
          />
        </div>
        <select
          aria-label="Online or offline"
          value={channel}
          onChange={(e) => setChannel(e.target.value as "" | SaleChannel)}
          className={SELECT}
        >
          {Object.entries(CHANNEL_FILTERS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {visible && orders.data && (
        <p className="mt-3 text-sm text-muted">
          {visible.length} sale{visible.length === 1 ? "" : "s"} ·{" "}
          {money.format(visible.reduce((sum, o) => sum + o.total, 0))}
        </p>
      )}

      <div className="mt-4">
        {orders.failed ? (
          <LoadError />
        ) : !orders.data || !visible ? (
          <Loading />
        ) : orders.data.length === 0 ? (
          <p className="text-sm text-muted">No sales recorded yet.</p>
        ) : visible.length === 0 ? (
          <NoMatches />
        ) : (
          <div className={TABLE_CARD}>
            <table className={TABLE}>
              <thead className={THEAD}>
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Items</th>
                  <th className="px-4 py-3">Channel</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Sold by</th>
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pager.pageItems?.map((order) => (
                  <tr key={order.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3">
                      {new Date(order.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {order.customer.name}
                    </td>
                    <td className="px-4 py-3">{order.customer.phone}</td>
                    <td className="px-4 py-3">{itemsText(order)}</td>
                    <td className="px-4 py-3">
                      <ChannelBadge channel={order.channel} />
                    </td>
                    <td className="px-4 py-3 capitalize">
                      {order.paymentMethod}
                    </td>
                    <td className="px-4 py-3">
                      {order.soldBy ? (
                        <Link
                          href={`/user?id=${encodeURIComponent(
                            order.soldBy.role === "admin"
                              ? "admin"
                              : (order.soldBy.staffId ?? ""),
                          )}`}
                          className="hover:text-brand-deep hover:underline"
                        >
                          {order.soldBy.name}
                        </Link>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {money.format(order.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Pagination pager={pager} label="sales" />
    </div>
  );
}
