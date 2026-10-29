"use client";

import Link from "next/link";
import { useState } from "react";
import { flushSync } from "react-dom";
import type { Order, SaleChannel } from "@pos/types";
import ConfirmDialog from "../../components/confirm-dialog";
import Modal from "../../components/modal";
import RecordSaleForm from "../../components/record-sale-form";
import Receipt from "../../components/receipt";
import { printOrderReceipt } from "../../lib/print";
import PrinterSettings, {
  useDesktopApp,
} from "../../components/printer-settings";
import ActionModals, {
  Notice,
  type ActionModal,
} from "../../components/action-modals";
import {
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SELECT,
  TABLE,
  TABLE_CARD,
  THEAD,
} from "../../components/form-styles";
import Pagination, { usePagination } from "../../components/pagination";
import SearchBox, { matches, NoMatches } from "../../components/search-box";
import {
  apiFetch,
  describeError,
  fetchCatalog,
  fetchOrders,
  money,
  useLoad,
} from "../../lib/api";
import { LoadError, Loading } from "../../lib/status";
import PageHeader from "../../components/page-header";
import Icon from "../../components/icons";

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
  const [refunding, setRefunding] = useState<Order | null>(null);
  const [editing, setEditing] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState<Order | null>(null);
  const desktopApp = useDesktopApp();
  const [printerSettings, setPrinterSettings] = useState(false);

  const productNames = Object.fromEntries(
    (catalog.data?.products ?? []).map((p) => [p.id, p.name]),
  );

  const printReceipt = async (order: Order) => {
    setError(null);
    // Render this sale's receipt before the print dialog opens.
    flushSync(() => setPrinting(order));
    setError(await printOrderReceipt(order, productNames, true));
  };

  // Puts the items back in stock and takes the sale out of every total.
  const refund = async (order: Order, reason: string) => {
    setError(null);
    try {
      const res = await apiFetch(`/orders/${order.id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok)
        throw new Error(
          (await res.json().catch(() => null))?.error ??
            "Could not refund the sale",
        );
      setNotice(
        `Refunded ${money.format(order.total)} to ${order.customer.name}. The items are back in stock.`,
      );
      await Promise.all([orders.reload(), catalog.reload()]);
    } catch (e) {
      setError(describeError(e, "Could not refund the sale"));
    } finally {
      setRefunding(null);
    }
  };

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
              order.refund ? "refunded" : undefined,
            ),
        )
    : null;

  const pager = usePagination(visible, JSON.stringify([search, channel]));

  return (
    <>
      <div className="mx-auto max-w-6xl print:hidden">
        <PageHeader icon="sales" section="Shop" title="Sales">
          {desktopApp && (
            <button
              onClick={() => setPrinterSettings(true)}
              className={SECONDARY_BUTTON}
            >
              <Icon name="printer" className="h-4 w-4" />
              Printer
            </button>
          )}
          <button onClick={() => setModal("sale")} className={PRIMARY_BUTTON}>
            Record sale
          </button>
        </PageHeader>
        <Notice text={notice} />
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        {refunding && (
          <ConfirmDialog
            title="Refund sale"
            message={`Refund ${money.format(refunding.total)} to ${refunding.customer.name}? The items go back into stock and the sale stops counting in your totals. Give the customer their money back yourself; this can't be undone.`}
            confirmLabel="Refund sale"
            withNote
            danger
            onConfirm={(reason) => refund(refunding, reason)}
            onClose={() => setRefunding(null)}
          />
        )}
        {editing && (
          <Modal title="Edit sale" onClose={() => setEditing(null)} wide>
            <RecordSaleForm
              order={editing}
              onSaved={(message) => {
                setEditing(null);
                setNotice(message);
                void orders.reload();
                void catalog.reload();
              }}
              onCancel={() => setEditing(null)}
            />
          </Modal>
        )}
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
            {money.format(
              visible.reduce((sum, o) => (o.refund ? sum : sum + o.total), 0),
            )}
            {visible.some((o) => o.refund) && " (refunds not counted)"}
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
                    <th className="px-4 py-3">
                      <span className="sr-only">Receipt, edit and refund</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {pager.pageItems?.map((order) => (
                    <tr
                      key={order.id}
                      className={`align-top ${order.refund ? "text-muted" : ""}`}
                    >
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
                        <span className={order.refund ? "line-through" : ""}>
                          {money.format(order.total)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <button
                          onClick={() => void printReceipt(order)}
                          className="mr-4 font-medium text-brand-deep hover:underline"
                        >
                          Receipt
                        </button>
                        {order.refund ? (
                          <span
                            title={
                              `Refunded by ${order.refund.by} on ${new Date(order.refund.at).toLocaleString()}` +
                              (order.refund.reason
                                ? `: ${order.refund.reason}`
                                : "")
                            }
                            className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800"
                          >
                            Refunded
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={() => setEditing(order)}
                              className="mr-4 font-medium text-brand-deep hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setRefunding(order)}
                              className="font-medium text-red-700 hover:underline"
                            >
                              Refund
                            </button>
                          </>
                        )}
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
      {printing && (
        <Receipt order={printing} copy productNames={productNames} />
      )}
      {printerSettings && (
        <PrinterSettings onClose={() => setPrinterSettings(false)} />
      )}
    </>
  );
}
