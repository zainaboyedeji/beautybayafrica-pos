"use client";

import { useState } from "react";
import type { Order, PaymentMethod, SaleChannel } from "@pos/types";
import {
  API_URL,
  apiFetch,
  describeError,
  fetchCatalog,
  fetchCustomers,
  money,
  sellables,
  useLoad,
} from "../lib/api";
import { INPUT, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./form-styles";

const NEW_CUSTOMER = "__new__";

/** `key` is a product id, or an option id for products with options. */
type Line = { key: string; quantity: string };

const EMPTY_LINE: Line = { key: "", quantity: "1" };

const CHANNELS: { value: SaleChannel; label: string; hint: string }[] = [
  { value: "offline", label: "Offline", hint: "Sold in the shop" },
  { value: "online", label: "Online", hint: "Website, Instagram, WhatsApp…" },
];

type Props = {
  /** A sale to correct; without one, the form records a new sale. */
  order?: Order;
  onSaved: (message: string) => void;
  onCancel: () => void;
};

/** An ISO time as a datetime-local input's value, in local time. */
const toLocalInput = (iso: string) => {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
};

export default function RecordSaleForm({ order, onSaved, onCancel }: Props) {
  const catalog = useLoad(fetchCatalog);
  const customers = useLoad(fetchCustomers);

  const [customerPhone, setCustomerPhone] = useState(NEW_CUSTOMER);
  const [newCustomer, setNewCustomer] = useState({
    name: order?.customer.name ?? "",
    phone: order?.customer.phone ?? "",
    email: order?.customer.email ?? "",
  });
  // Left unset so the admin has to say where the sale happened.
  const [channel, setChannel] = useState<SaleChannel | null>(
    order?.channel ?? null,
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    order?.paymentMethod ?? "transfer",
  );
  const initialDate = order ? toLocalInput(order.createdAt) : "";
  const [date, setDate] = useState(initialDate);
  const [lines, setLines] = useState<Line[]>(
    order
      ? order.items.map((i) => ({
          key: i.variantId ?? i.productId,
          quantity: String(i.quantity),
        }))
      : [EMPTY_LINE],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Items already on a sale being edited keep the price they were sold at,
  // and stay choosable even if their product has since been removed.
  const sold = new Map(
    (order?.items ?? []).map((i) => [i.variantId ?? i.productId, i]),
  );
  const catalogItems = (catalog.data?.products ?? [])
    .flatMap(sellables)
    .map((s) => ({
      key: s.key,
      name: s.name,
      price: sold.get(s.key)?.unitPrice ?? s.price,
      productId: s.product.id,
      variantId: s.variant?.id,
    }));
  const items = [
    ...catalogItems,
    ...[...sold]
      .filter(([key]) => catalog.data && !catalogItems.some((s) => s.key === key))
      .map(([key, i]) => ({
        key,
        name: i.name ?? "Removed product",
        price: i.unitPrice,
        productId: i.productId,
        variantId: i.variantId,
      })),
  ];
  // What this sale already holds is available to it too.
  const stock = Object.fromEntries(
    items.map((s) => [
      s.key,
      (catalog.data?.stock[s.key] ?? 0) +
        (order?.items ?? [])
          .filter((i) => (i.variantId ?? i.productId) === s.key)
          .reduce((sum, i) => sum + i.quantity, 0),
    ]),
  );

  const total = lines.reduce((sum, line) => {
    const item = items.find((s) => s.key === line.key);
    return sum + (item ? item.price * Number(line.quantity || 0) : 0);
  }, 0);

  const updateLine = (index: number, change: Partial<Line>) =>
    setLines(lines.map((l, i) => (i === index ? { ...l, ...change } : l)));

  const failure = order ? "Could not save the changes" : "Could not record sale";

  const submit = async () => {
    if (!channel) {
      setError("Choose whether this sale was online or offline");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const customer =
        customerPhone === NEW_CUSTOMER
          ? newCustomer
          : customers.data?.find((c) => c.phone === customerPhone);
      if (!customer) throw new Error("Choose a customer");

      // Combine repeated products into one line each.
      const quantities = new Map<string, number>();
      for (const line of lines) {
        quantities.set(
          line.key,
          (quantities.get(line.key) ?? 0) + Number(line.quantity),
        );
      }

      const res = await apiFetch(order ? `/orders/${order.id}` : "/orders", {
        method: order ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod,
          channel,
          customer,
          items: [...quantities].map(([key, quantity]) => {
            const item = items.find((s) => s.key === key)!;
            return {
              productId: item.productId,
              ...(item.variantId ? { variantId: item.variantId } : {}),
              quantity,
            };
          }),
          // An unchanged date is left alone, so it keeps its seconds.
          ...(date && date !== initialDate
            ? { createdAt: new Date(date).toISOString() }
            : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? failure);
      onSaved(
        order
          ? `Sale to ${customer.name} updated: now ${money.format(body.total)}.`
          : `${channel === "online" ? "Online" : "Offline"} sale of ${money.format(body.total)} recorded for ${body.customer.name}.`,
      );
    } catch (e) {
      setError(describeError(e, failure));
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <fieldset>
        <legend className="text-sm font-medium">
          Where was this sale made?
        </legend>
        <div className="mt-1 grid gap-3 sm:grid-cols-2">
          {CHANNELS.map((c) => (
            <label
              key={c.value}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors ${
                channel === c.value
                  ? "border-brand bg-brand-soft/40"
                  : "border-line-strong hover:bg-surface-alt"
              }`}
            >
              <input
                type="radio"
                name="channel"
                required
                value={c.value}
                checked={channel === c.value}
                onChange={() => {
                  setChannel(c.value);
                  setError(null);
                }}
                className="h-4 w-4 accent-brand-deep"
              />
              <span>
                <span className="block font-semibold">{c.label}</span>
                <span className="block text-xs text-muted">{c.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="text-sm font-medium">
          Customer
          <select
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            className={INPUT}
          >
            <option value={NEW_CUSTOMER}>
              {order ? "Type the details…" : "New customer…"}
            </option>
            {(customers.data ?? []).map((c) => (
              <option key={c.phone} value={c.phone}>
                {c.name} ({c.phone})
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Payment method
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
            className={INPUT}
          >
            <option value="transfer">Bank transfer</option>
            <option value="card">Card</option>
          </select>
        </label>
        <label className="text-sm font-medium">
          Sale date <span className="font-normal text-muted">(optional)</span>
          <input
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={INPUT}
          />
        </label>
      </div>

      {customerPhone === NEW_CUSTOMER && (
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="text-sm font-medium">
            Full name
            <input
              required
              value={newCustomer.name}
              onChange={(e) =>
                setNewCustomer({ ...newCustomer, name: e.target.value })
              }
              className={INPUT}
            />
          </label>
          <label className="text-sm font-medium">
            Phone number
            <input
              required
              type="tel"
              value={newCustomer.phone}
              onChange={(e) =>
                setNewCustomer({ ...newCustomer, phone: e.target.value })
              }
              className={INPUT}
            />
          </label>
          <label className="text-sm font-medium">
            Email <span className="font-normal text-muted">(optional)</span>
            <input
              type="email"
              value={newCustomer.email}
              onChange={(e) =>
                setNewCustomer({ ...newCustomer, email: e.target.value })
              }
              className={INPUT}
            />
          </label>
        </div>
      )}

      <p className="mt-4 text-sm font-medium">Items</p>
      {lines.map((line, index) => (
        <div key={index} className="mt-2 flex gap-3">
          {/* Widths sit on wrappers: INPUT's w-full would beat them otherwise. */}
          <div className="min-w-0 flex-1">
            <select
              required
              aria-label={`Product ${index + 1}`}
              value={line.key}
              onChange={(e) => updateLine(index, { key: e.target.value })}
              className={`${INPUT} mt-0`}
            >
              <option value="">Choose a product…</option>
              {items.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name} — {money.format(s.price)} ({stock[s.key] ?? 0} in
                  stock)
                </option>
              ))}
            </select>
          </div>
          <div className="w-24 shrink-0">
            <input
              required
              type="number"
              min={1}
              step={1}
              aria-label={`Quantity ${index + 1}`}
              value={line.quantity}
              onChange={(e) => updateLine(index, { quantity: e.target.value })}
              className={`${INPUT} mt-0`}
            />
          </div>
          <button
            type="button"
            disabled={lines.length === 1}
            onClick={() => setLines(lines.filter((_, i) => i !== index))}
            className="rounded-md px-3 text-sm text-muted hover:bg-brand-soft disabled:opacity-40"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => setLines([...lines, EMPTY_LINE])}
        className="mt-3 text-sm font-medium text-brand-deep underline"
      >
        + Add another item
      </button>

      {(catalog.failed || customers.failed) && (
        <p className="mt-3 text-sm text-red-700">
          Cannot reach the sync API at {API_URL}.
        </p>
      )}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <div className="mt-5 flex items-center justify-end gap-3">
        <span className="mr-auto text-lg font-semibold">
          Total: {money.format(total)}
        </span>
        <button type="button" onClick={onCancel} className={SECONDARY_BUTTON}>
          Cancel
        </button>
        <button type="submit" disabled={saving} className={PRIMARY_BUTTON}>
          {saving ? "Saving…" : order ? "Save changes" : "Record sale"}
        </button>
      </div>
    </form>
  );
}
