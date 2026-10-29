"use client";

import { useState } from "react";
import type { Customer } from "@pos/types";
import ActionModals, {
  Notice,
  type ActionModal,
} from "../../components/action-modals";
import AddCustomerForm from "../../components/add-customer-form";
import Modal from "../../components/modal";
import {
  PRIMARY_BUTTON,
  TABLE,
  TABLE_CARD,
  THEAD,
} from "../../components/form-styles";
import Pagination, { usePagination } from "../../components/pagination";
import SearchBox, { matches, NoMatches } from "../../components/search-box";
import {
  fetchCustomers,
  fetchOrders,
  money,
  summariseCustomers,
  useLoad,
} from "../../lib/api";
import { LoadError, Loading } from "../../lib/status";
import PageHeader from "../../components/page-header";

export default function CustomersPage() {
  const customers = useLoad(fetchCustomers);
  const orders = useLoad(fetchOrders);
  const [modal, setModal] = useState<ActionModal | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);

  const rows =
    customers.data && orders.data
      ? summariseCustomers(customers.data, orders.data)
      : null;
  const visible = rows?.filter((c) =>
    matches(search, c.name, c.phone, c.email),
  );

  const pager = usePagination(visible, JSON.stringify([search]));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader icon="customers" section="Shop" title="Customers">
        <button onClick={() => setModal("customer")} className={PRIMARY_BUTTON}>
          Add customer
        </button>
      </PageHeader>
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
      {editing && (
        <Modal title="Edit customer" onClose={() => setEditing(null)}>
          <AddCustomerForm
            customer={editing}
            onSaved={(message) => {
              setEditing(null);
              setNotice(message);
              void customers.reload();
              void orders.reload();
            }}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}

      <div className="mt-6">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search by name, phone or email"
        />
      </div>

      <div className="mt-4">
        {customers.failed || orders.failed ? (
          <LoadError />
        ) : !rows || !visible ? (
          <Loading />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted">No customers yet.</p>
        ) : visible.length === 0 ? (
          <NoMatches />
        ) : (
          <div className={TABLE_CARD}>
            <table className={TABLE}>
              <thead className={THEAD}>
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3 text-right">Purchases</th>
                  <th className="px-4 py-3 text-right">Total spent</th>
                  <th className="px-4 py-3">Last purchase</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Edit</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pager.pageItems?.map((c) => (
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
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() =>
                          setEditing({
                            name: c.name,
                            phone: c.phone,
                            ...(c.email ? { email: c.email } : {}),
                          })
                        }
                        className="font-medium text-brand-deep hover:underline"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Pagination pager={pager} label="customers" />
    </div>
  );
}
