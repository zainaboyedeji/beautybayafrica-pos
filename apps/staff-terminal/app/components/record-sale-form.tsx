"use client";

import { useState } from "react";
import type { PaymentMethod } from "@pos/types";
import {
  API_URL,
  apiFetch,
  describeError,
  fetchCatalog,
  fetchCustomers,
  money,
  orderItem,
  sellables,
  useLoad,
} from "../lib/api";
import { INPUT, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./form-styles";

const NEW_CUSTOMER = "__new__";

/** `key` is a product id, or an option id for products with options. */
type Line = { key: string; quantity: string };

const EMPTY_LINE: Line = { key: "", quantity: "1" };

type Props = { onSaved: (message: string) => void; onCancel: () => void };

export default function RecordSaleForm({ onSaved, onCancel }: Props) {
  const catalog = useLoad(fetchCatalog);
  const customers = useLoad(fetchCustomers);

  const [customerPhone, setCustomerPhone] = useState(NEW_CUSTOMER);
  const [newCustomer, setNewCustomer] = useState({
    name: "",
    phone: "",
    email: "",
  });
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("transfer");
  const [date, setDate] = useState("");
  const [lines, setLines] = useState<Line[]>([EMPTY_LINE]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = (catalog.data?.products ?? []).flatMap(sellables);
  const stock = catalog.data?.stock ?? {};

  const total = lines.reduce((sum, line) => {
    const item = items.find((s) => s.key === line.key);
    return sum + (item ? item.price * Number(line.quantity || 0) : 0);
  }, 0);

  const updateLine = (index: number, change: Partial<Line>) =>
    setLines(lines.map((l, i) => (i === index ? { ...l, ...change } : l)));

  const submit = async () => {
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

      const res = await apiFetch("/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod,
          customer,
          items: [...quantities].map(([key, quantity]) =>
            orderItem(
              items.find((s) => s.key === key)!,
              quantity,
            ),
          ),
          ...(date ? { createdAt: new Date(date).toISOString() } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not record sale");
      onSaved(
        `Sale of ${money.format(body.total)} recorded for ${body.customer.name}.`,
      );
    } catch (e) {
      setError(describeError(e, "Could not record sale"));
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
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm font-medium">
          Customer
          <select
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            className={INPUT}
          >
            <option value={NEW_CUSTOMER}>New customer…</option>
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
          {saving ? "Saving…" : "Record sale"}
        </button>
      </div>
    </form>
  );
}
