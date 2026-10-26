"use client";

import { useState } from "react";
import { apiFetch, describeError } from "../lib/api";
import { INPUT, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./form-styles";

type Props = { onSaved: (message: string) => void; onCancel: () => void };

export default function AddCustomerForm({ onSaved, onCancel }: Props) {
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not add customer");
      onSaved(`${body.name} added.`);
    } catch (e) {
      setError(describeError(e, "Could not add customer"));
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
          {saving ? "Saving…" : "Add customer"}
        </button>
      </div>
    </form>
  );
}
