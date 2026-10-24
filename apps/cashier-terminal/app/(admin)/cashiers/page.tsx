"use client";

import { useState } from "react";
import { Notice } from "../../components/action-modals";
import { INPUT, PRIMARY_BUTTON } from "../../components/form-styles";
import {
  apiFetch,
  describeError,
  fetchCashiers,
  useLoad,
  type Cashier,
} from "../../lib/api";
import { LoadError, Loading } from "../../lib/status";

export default function CashiersPage() {
  const cashiers = useLoad(fetchCashiers);
  const [form, setForm] = useState({ name: "", pin: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const add = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/cashiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not add cashier");
      setForm({ name: "", pin: "" });
      setNotice(`${body.name} added. They can now log in with their PIN.`);
      await cashiers.reload();
    } catch (e) {
      setError(describeError(e, "Could not add cashier"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (cashier: Cashier) => {
    if (!window.confirm(`Remove ${cashier.name}? Their PIN will stop working.`))
      return;
    setError(null);
    try {
      const res = await apiFetch(`/cashiers/${cashier.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Could not remove cashier");
      setNotice(`${cashier.name} removed.`);
      await cashiers.reload();
    } catch (e) {
      setError(describeError(e, "Could not remove cashier"));
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-3xl font-semibold">Cashiers</h1>
      <p className="mt-1 text-sm text-muted">
        Cashiers log in with their PIN and can only sell products. They cannot
        see sales, customers or change inventory.
      </p>
      <Notice text={notice} />

      <form
        className="mt-6 flex flex-wrap items-end gap-3 rounded-lg bg-white p-5 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <label className="flex-1 text-sm font-medium">
          Name
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={INPUT}
          />
        </label>
        <label className="w-40 text-sm font-medium">
          PIN (4–8 digits)
          <input
            required
            inputMode="numeric"
            pattern="\d{4,8}"
            autoComplete="off"
            value={form.pin}
            onChange={(e) => setForm({ ...form, pin: e.target.value })}
            className={INPUT}
          />
        </label>
        <button type="submit" disabled={saving} className={PRIMARY_BUTTON}>
          {saving ? "Adding…" : "Add cashier"}
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <div className="mt-6">
        {cashiers.failed ? (
          <LoadError />
        ) : !cashiers.data ? (
          <Loading />
        ) : cashiers.data.length === 0 ? (
          <p className="text-sm text-muted">No cashiers yet.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg bg-white shadow-sm">
            {cashiers.data.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <span className="font-medium">{c.name}</span>
                <button
                  onClick={() => void remove(c)}
                  className="font-medium text-red-700 hover:underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
