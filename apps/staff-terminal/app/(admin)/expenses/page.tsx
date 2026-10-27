"use client";

import { useState } from "react";
import type { Expense, ExpensePaymentMethod } from "@pos/types";
import { Notice } from "../../components/action-modals";
import {
  CARD,
  INPUT,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SELECT,
  TABLE,
  TABLE_CARD,
  THEAD,
} from "../../components/form-styles";
import ConfirmDialog from "../../components/confirm-dialog";
import Modal from "../../components/modal";
import Pagination, { usePagination } from "../../components/pagination";
import SearchBox, { matches, NoMatches } from "../../components/search-box";
import {
  apiFetch,
  describeError,
  fetchExpenses,
  fetchSuppliers,
  money,
  useLoad,
} from "../../lib/api";
import { LoadError, Loading } from "../../lib/status";
import PageHeader from "../../components/page-header";

const CATEGORIES = [
  "Stock purchase",
  "Equipment & store items",
  "Rent",
  "Salaries",
  "Electricity & fuel",
  "Internet & phone",
  "Transport & delivery",
  "Repairs & maintenance",
  "Packaging",
  "Marketing",
  "Bank charges",
  "Other",
];

const PAYMENT_LABELS: Record<ExpensePaymentMethod, string> = {
  cash: "Cash",
  transfer: "Bank transfer",
  card: "Card",
};

// Today on this computer's calendar, as YYYY-MM-DD.
const today = () => new Date().toLocaleDateString("en-CA");

const formatDay = (day: string) =>
  new Date(`${day}T00:00:00`).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export default function ExpensesPage() {
  const expenses = useLoad(fetchExpenses);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);

  const visible = expenses.data?.filter(
    (e) =>
      (!category || e.category === category) &&
      matches(
        search,
        e.description,
        e.category,
        e.supplierName,
        e.notes,
        PAYMENT_LABELS[e.paymentMethod],
      ),
  );
  const thisMonth = today().slice(0, 7);
  const monthTotal = (expenses.data ?? [])
    .filter((e) => e.spentOn.startsWith(thisMonth))
    .reduce((sum, e) => sum + e.amount, 0);
  const shownTotal = (visible ?? []).reduce((sum, e) => sum + e.amount, 0);

  const remove = async (expense: Expense) => {
    setDeleting(null);
    setError(null);
    try {
      const res = await apiFetch(`/expenses/${expense.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Could not delete expense");
      setNotice("Expense deleted.");
      await expenses.reload();
    } catch (e) {
      setError(describeError(e, "Could not delete expense"));
    }
  };

  const pager = usePagination(visible, JSON.stringify([search, category]));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader icon="expenses" section="Money" title="Expenses">
        <button onClick={() => setAdding(true)} className={PRIMARY_BUTTON}>
          Record expense
        </button>
      </PageHeader>
      <Notice text={notice} />
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {deleting && (
        <ConfirmDialog
          title="Delete expense"
          message={`Delete "${deleting.description}" (${money.format(deleting.amount)})? Only do this to correct a mistake.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => remove(deleting)}
          onClose={() => setDeleting(null)}
        />
      )}
      {adding && (
        <Modal title="Record money spent" onClose={() => setAdding(false)}>
          <ExpenseForm
            onCancel={() => setAdding(false)}
            onSaved={(message) => {
              setAdding(false);
              setNotice(message);
              void expenses.reload();
            }}
          />
        </Modal>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className={CARD}>
          <p className="text-sm text-muted">Spent this month</p>
          <p className="mt-1 text-2xl font-semibold">
            {money.format(monthTotal)}
          </p>
        </div>
        <div className={CARD}>
          <p className="text-sm text-muted">
            Total of the expenses listed below
          </p>
          <p className="mt-1 text-2xl font-semibold">
            {money.format(shownTotal)}
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="min-w-64 flex-1">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search by description, supplier or notes"
          />
        </div>
        <select
          aria-label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={SELECT}
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="mt-4">
        {expenses.failed ? (
          <LoadError />
        ) : !expenses.data || !visible ? (
          <Loading />
        ) : expenses.data.length === 0 ? (
          <p className="text-sm text-muted">No expenses recorded yet.</p>
        ) : visible.length === 0 ? (
          <NoMatches />
        ) : (
          <div className={TABLE_CARD}>
            <table className={TABLE}>
              <thead className={THEAD}>
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Paid by</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pager.pageItems?.map((e) => (
                  <tr key={e.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatDay(e.spentOn)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium">{e.description}</span>
                      {e.notes && (
                        <p className="mt-0.5 whitespace-pre-line text-muted">
                          {e.notes}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">{e.category}</td>
                    <td className="px-4 py-3">{e.supplierName ?? "—"}</td>
                    <td className="px-4 py-3">
                      {PAYMENT_LABELS[e.paymentMethod]}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {money.format(e.amount)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setDeleting(e)}
                        className="font-medium text-red-700 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Pagination pager={pager} label="expenses" />
    </div>
  );
}

function ExpenseForm({
  onSaved,
  onCancel,
}: {
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const suppliers = useLoad(fetchSuppliers);
  const [form, setForm] = useState({
    spentOn: today(),
    description: "",
    category: CATEGORIES[0],
    amount: "",
    paymentMethod: "transfer" as ExpensePaymentMethod,
    supplierId: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not record expense");
      onSaved(`${money.format(body.amount)} for ${body.description} recorded.`);
    } catch (e) {
      setError(describeError(e, "Could not record expense"));
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
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Date
          <input
            required
            type="date"
            max={today()}
            value={form.spentOn}
            onChange={(e) => setForm({ ...form, spentOn: e.target.value })}
            className={INPUT}
          />
        </label>
        <label className="text-sm font-medium">
          Amount
          <input
            required
            type="number"
            min={0.01}
            step={0.01}
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            className={INPUT}
          />
        </label>
      </div>
      <label className="text-sm font-medium">
        What was it for?
        <input
          autoFocus
          required
          placeholder="e.g. Diesel for generator"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className={INPUT}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          Category
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className={INPUT}
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Paid by
          <select
            value={form.paymentMethod}
            onChange={(e) =>
              setForm({
                ...form,
                paymentMethod: e.target.value as ExpensePaymentMethod,
              })
            }
            className={INPUT}
          >
            {(Object.keys(PAYMENT_LABELS) as ExpensePaymentMethod[]).map(
              (m) => (
                <option key={m} value={m}>
                  {PAYMENT_LABELS[m]}
                </option>
              ),
            )}
          </select>
        </label>
      </div>
      <label className="text-sm font-medium">
        Supplier <span className="font-normal text-muted">(optional)</span>
        <select
          value={form.supplierId}
          onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
          className={INPUT}
        >
          <option value="">None</option>
          {(suppliers.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium">
        Notes{" "}
        <span className="font-normal text-muted">
          (optional, e.g. receipt number or who paid)
        </span>
        <textarea
          rows={2}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          className={INPUT}
        />
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="mt-2 flex justify-end gap-3">
        <button type="button" onClick={onCancel} className={SECONDARY_BUTTON}>
          Cancel
        </button>
        <button type="submit" disabled={saving} className={PRIMARY_BUTTON}>
          {saving ? "Saving…" : "Record expense"}
        </button>
      </div>
    </form>
  );
}
