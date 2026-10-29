"use client";

import { useState } from "react";
import type { Customer } from "@pos/types";
import { apiFetch, describeError } from "../lib/api";
import { INPUT, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./form-styles";

type Props = {
  /** A saved customer to change; without one, the form adds a new customer. */
  customer?: Customer;
  onSaved: (message: string) => void;
  onCancel: () => void;
};

export default function AddCustomerForm({
  customer,
  onSaved,
  onCancel,
}: Props) {
  const [form, setForm] = useState({
    name: customer?.name ?? "",
    phone: customer?.phone ?? "",
    email: customer?.email ?? "",
  });
  const failure = customer
    ? "Could not save the changes"
    : "Could not add customer";
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(
        customer
          ? `/customers/${encodeURIComponent(customer.phone)}`
          : "/customers",
        {
          method: customer ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? failure);
      onSaved(
        customer ? `${body.name}'s details saved.` : `${body.name} added.`,
      );
    } catch (e) {
      setError(describeError(e, failure));
      setSaving(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label className="text-sm font-medium">
        Full name
        <input
          autoFocus
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className={INPUT}
        />
      </label>
      <label className="text-sm font-medium">
        Phone number
        <input
          required
          type="tel"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          className={INPUT}
        />
      </label>
      <label className="text-sm font-medium">
        Email <span className="font-normal text-muted">(optional)</span>
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className={INPUT}
        />
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="mt-2 flex justify-end gap-3">
        <button type="button" onClick={onCancel} className={SECONDARY_BUTTON}>
          Cancel
        </button>
        <button type="submit" disabled={saving} className={PRIMARY_BUTTON}>
          {saving ? "Saving…" : customer ? "Save changes" : "Add customer"}
        </button>
      </div>
    </form>
  );
}
