"use client";

import { useState } from "react";
import ActionModals, {
  Notice,
  type ActionModal,
} from "../../components/action-modals";
import { PRIMARY_BUTTON } from "../../components/form-styles";
import {
  fetchCustomers,
  fetchOrders,
  money,
  summariseCustomers,
  useLoad,
} from "../../lib/api";
import { LoadError, Loading } from "../../lib/status";

export default function CustomersPage() {
  const customers = useLoad(fetchCustomers);
  const orders = useLoad(fetchOrders);
  const [modal, setModal] = useState<ActionModal | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const rows =
    customers.data && orders.data
      ? summariseCustomers(customers.data, orders.data)
      : null;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Customers</h1>
        <button onClick={() => setModal("customer")} className={PRIMARY_BUTTON}>
          Add customer
        </button>
      </div>
      <Notice text={notice} />
      <ActionModals
        open={modal}
        onClose={() => setModal(null)}
        onSaved={(message) => {
          setModal(null);
          setNotice(message);
          void customers.reload();
        }}
      />

      <div className="mt-6">
        {customers.failed || orders.failed ? (
          <LoadError />
        ) : !rows ? (
          <Loading />
        ) : rows.length === 0 ? (
          <p className="text-sm text-zinc-500">No customers yet.</p>
        ) : (
          <table className="w-full overflow-hidden rounded-lg bg-white text-left text-sm shadow-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3 text-right">Purchases</th>
                <th className="px-4 py-3 text-right">Total spent</th>
                <th className="px-4 py-3">Last purchase</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((c) => (
                <tr key={c.phone}>
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3">{c.phone}</td>
                  <td className="px-4 py-3">{c.email ?? "—"}</td>
                  <td className="px-4 py-3 text-right">{c.orders}</td>
                  <td className="px-4 py-3 text-right font-medium">
                    {money.format(c.totalSpent)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {c.lastPurchase
                      ? new Date(c.lastPurchase).toLocaleString()
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
