"use client";

import { useState } from "react";
import type { Order } from "@pos/types";
import ActionModals, {
  Notice,
  type ActionModal,
} from "../../components/action-modals";
import { PRIMARY_BUTTON } from "../../components/form-styles";
import Pagination, { usePagination } from "../../components/pagination";
import SearchBox, { matches, NoMatches } from "../../components/search-box";
import { fetchCatalog, fetchOrders, money, useLoad } from "../../lib/api";
import { LoadError, Loading } from "../../lib/status";

export default function SalesPage() {
  const orders = useLoad(fetchOrders);
  const catalog = useLoad(fetchCatalog);
  const [modal, setModal] = useState<ActionModal | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const productName = (id: string) =>
    catalog.data?.products.find((p) => p.id === id)?.name ?? "Removed product";

  const itemsText = (order: Order) =>
    order.items
      .map((i) => `${i.quantity} × ${i.name ?? productName(i.productId)}`)
      .join(", ");

  const visible = orders.data
    ? [...orders.data]
        .reverse()
        .filter((order) =>
          matches(
            search,
            order.customer.name,
            order.customer.phone,
            order.paymentMethod,
            itemsText(order),
          ),
        )
    : null;

  const pager = usePagination(visible, JSON.stringify([search]));

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Sales</h1>
        <button onClick={() => setModal("sale")} className={PRIMARY_BUTTON}>
          Record sale
        </button>
      </div>
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

      <div className="mt-6">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search by customer, phone, item or payment"
        />
      </div>

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
          <table className="w-full overflow-hidden rounded-lg bg-white text-left text-sm shadow-sm">
            <thead className="bg-surface-alt text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Phone</th>
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
                  <td className="px-4 py-3 font-medium">
                    {order.customer.name}
                  </td>
                  <td className="px-4 py-3">{order.customer.phone}</td>
                  <td className="px-4 py-3">{itemsText(order)}</td>
                  <td className="px-4 py-3 capitalize">
                    {order.paymentMethod}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {money.format(order.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Pagination pager={pager} label="sales" />
    </div>
  );
}
