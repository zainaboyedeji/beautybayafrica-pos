"use client";

import { useState, type ChangeEvent } from "react";
import type { Supplier } from "@pos/types";
import { Notice } from "../../components/action-modals";
import {
  INPUT,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
} from "../../components/form-styles";
import ConfirmDialog from "../../components/confirm-dialog";
import Modal from "../../components/modal";
import SearchBox, { matches, NoMatches } from "../../components/search-box";
import {
  apiFetch,
  describeError,
  fetchSuppliers,
  useLoad,
} from "../../lib/api";
import { LoadError, Loading } from "../../lib/status";

const EMPTY_FORM = {
  name: "",
  contactPerson: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
};

export default function SuppliersPage() {
  const suppliers = useLoad(fetchSuppliers);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  // null: closed; "new": adding; a supplier: editing it.
  const [editing, setEditing] = useState<Supplier | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Supplier | null>(null);

  const visible = suppliers.data?.filter((s) =>
    matches(
      search,
      s.name,
      s.contactPerson,
      s.phone,
      s.email,
      s.address,
      s.notes,
    ),
  );

  const remove = async (supplier: Supplier) => {
    setRemoving(null);
    setError(null);
    try {
      const res = await apiFetch(`/suppliers/${supplier.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Could not remove supplier");
      setNotice(`${supplier.name} removed.`);
      await suppliers.reload();
    } catch (e) {
      setError(describeError(e, "Could not remove supplier"));
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Suppliers</h1>
        <button onClick={() => setEditing("new")} className={PRIMARY_BUTTON}>
          Add supplier
        </button>
      </div>
      <Notice text={notice} />
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {removing && (
        <ConfirmDialog
          title="Remove supplier"
          message={`Remove ${removing.name}? Expenses already recorded for them keep their name.`}
          confirmLabel="Remove"
          danger
          onConfirm={() => remove(removing)}
          onClose={() => setRemoving(null)}
        />
      )}
      {editing && (
        <Modal
          title={editing === "new" ? "Add a supplier" : "Edit supplier"}
          onClose={() => setEditing(null)}
        >
          <SupplierForm
            supplier={editing === "new" ? undefined : editing}
            onCancel={() => setEditing(null)}
            onSaved={(message) => {
              setEditing(null);
              setNotice(message);
              void suppliers.reload();
            }}
          />
        </Modal>
      )}

      <div className="mt-6">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search by name, contact, phone or what they supply"
        />
      </div>

      <div className="mt-4">
        {suppliers.failed ? (
          <LoadError />
        ) : !suppliers.data || !visible ? (
          <Loading />
        ) : suppliers.data.length === 0 ? (
          <p className="text-sm text-muted">No suppliers yet.</p>
        ) : visible.length === 0 ? (
          <NoMatches />
        ) : (
          <table className="w-full overflow-hidden rounded-lg bg-white text-left text-sm shadow-sm">
            <thead className="bg-surface-alt text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Contact person</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((s) => (
                <tr key={s.id} className="align-top">
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3">{s.contactPerson ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {s.phone ?? "—"}
                  </td>
                  <td className="px-4 py-3">{s.email ?? "—"}</td>
                  <td className="px-4 py-3">{s.address ?? "—"}</td>
                  <td className="whitespace-pre-line px-4 py-3 text-muted">
                    {s.notes ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button
                      onClick={() => setEditing(s)}
                      className="font-medium text-brand-deep hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setRemoving(s)}
                      className="ml-4 font-medium text-red-700 hover:underline"
                    >
                      Remove
                    </button>
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

function SupplierForm({
  supplier,
  onSaved,
  onCancel,
}: {
  supplier?: Supplier;
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(
    supplier
      ? {
          name: supplier.name,
          contactPerson: supplier.contactPerson ?? "",
          phone: supplier.phone ?? "",
          email: supplier.email ?? "",
          address: supplier.address ?? "",
          notes: supplier.notes ?? "",
        }
      : EMPTY_FORM,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(
        supplier ? `/suppliers/${supplier.id}` : "/suppliers",
        {
          method: supplier ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not save supplier");
      onSaved(`${body.name} ${supplier ? "updated" : "added"}.`);
    } catch (e) {
      setError(describeError(e, "Could not save supplier"));
      setSaving(false);
    }
  };

  const field = (key: keyof typeof EMPTY_FORM) => ({
    value: form[key],
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [key]: e.target.value }),
    className: INPUT,
  });

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label className="text-sm font-medium">
        Supplier or company name
        <input autoFocus required {...field("name")} />
      </label>
      <label className="text-sm font-medium">
        Contact person{" "}
        <span className="font-normal text-muted">(optional)</span>
        <input {...field("contactPerson")} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Phone <span className="font-normal text-muted">(optional)</span>
          <input type="tel" {...field("phone")} />
        </label>
        <label className="text-sm font-medium">
          Email <span className="font-normal text-muted">(optional)</span>
          <input type="email" {...field("email")} />
        </label>
      </div>
      <label className="text-sm font-medium">
        Address <span className="font-normal text-muted">(optional)</span>
        <input {...field("address")} />
      </label>
      <label className="text-sm font-medium">
        Notes{" "}
        <span className="font-normal text-muted">
          (what they supply, bank details, terms)
        </span>
        <textarea rows={3} {...field("notes")} />
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="mt-2 flex justify-end gap-3">
        <button type="button" onClick={onCancel} className={SECONDARY_BUTTON}>
          Cancel
        </button>
        <button type="submit" disabled={saving} className={PRIMARY_BUTTON}>
          {saving ? "Saving…" : supplier ? "Save changes" : "Add supplier"}
        </button>
      </div>
    </form>
  );
}
