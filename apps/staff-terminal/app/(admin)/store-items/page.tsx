"use client";

import { useState } from "react";
import type {
  ExpensePaymentMethod,
  StoreItem,
  StoreItemStatus,
} from "@pos/types";
import { Notice } from "../../components/action-modals";
import ConfirmDialog from "../../components/confirm-dialog";
import {
  INPUT,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
} from "../../components/form-styles";
import Modal from "../../components/modal";
import Pagination, { usePagination } from "../../components/pagination";
import SearchBox, { matches, NoMatches } from "../../components/search-box";
import {
  apiFetch,
  describeError,
  fetchStaff,
  fetchStoreItems,
  fetchSuppliers,
  money,
  useLoad,
} from "../../lib/api";
import { LoadError, Loading } from "../../lib/status";

// Suggestions for the category box; any other category can be typed in.
const CATEGORIES = [
  "Phones & tablets",
  "Computers & laptops",
  "Uniforms & wears",
  "Furniture & fittings",
  "Appliances",
  "Displays & decor",
  "Tools & equipment",
  "Other",
];

const STATUS_LABELS: Record<StoreItemStatus, string> = {
  in_use: "In use",
  in_storage: "In storage",
  under_repair: "Under repair",
  lost: "Lost or stolen",
  disposed: "Disposed of",
};

const STATUS_STYLES: Record<StoreItemStatus, string> = {
  in_use: "bg-emerald-100 text-emerald-800",
  in_storage: "bg-surface-alt text-muted",
  under_repair: "bg-amber-100 text-amber-800",
  lost: "bg-red-100 text-red-800",
  disposed: "bg-surface-alt text-muted line-through",
};

// Lost and disposed items no longer count towards what the shop owns.
const OWNED = (item: StoreItem) =>
  item.status !== "lost" && item.status !== "disposed";

const PAYMENT_LABELS: Record<ExpensePaymentMethod, string> = {
  cash: "Cash",
  transfer: "Bank transfer",
  card: "Card",
};

const SELECT =
  "rounded-md border border-line-strong bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand";

// Today on this computer's calendar, as YYYY-MM-DD.
const today = () => new Date().toLocaleDateString("en-CA");

const formatDay = (day: string) =>
  new Date(`${day}T00:00:00`).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const itemValue = (item: StoreItem) => (item.unitCost ?? 0) * item.quantity;

const IN_STORE = "__in_store__";

/** How many aren't handed to anyone. */
const inStore = (item: StoreItem) =>
  item.quantity - item.assignments.reduce((sum, a) => sum + a.quantity, 0);

/** Who has how many, then what is left in store. */
function Holders({ item }: { item: StoreItem }) {
  const left = inStore(item);
  return (
    <ul className="space-y-0.5">
      {item.assignments.map((a) => (
        <li key={a.assignedTo}>
          {a.assignedTo}
          {item.quantity > 1 && (
            <span className="text-muted"> × {a.quantity}</span>
          )}
        </li>
      ))}
      {left > 0 && (
        <li className="text-muted">
          {item.assignments.length === 0
            ? item.quantity > 1
              ? `All ${left} in store`
              : "In store"
            : `${left} in store`}
        </li>
      )}
    </ul>
  );
}

/** Things the shop owns for its own use: phones, laptops, uniforms… */
export default function StoreItemsPage() {
  const items = useLoad(fetchStoreItems);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<StoreItemStatus | "">("");
  // A person's name, IN_STORE, or "" for everyone.
  const [holder, setHolder] = useState("");
  // null: closed; "new": adding; an item: editing it.
  const [editing, setEditing] = useState<StoreItem | "new" | null>(null);
  const [removing, setRemoving] = useState<StoreItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const all = items.data ?? [];
  const categories = [
    ...new Set([...all.map((i) => i.category), ...CATEGORIES]),
  ].sort((a, b) => a.localeCompare(b));
  const holders = [
    ...new Set(all.flatMap((i) => i.assignments.map((a) => a.assignedTo))),
  ].sort((a, b) => a.localeCompare(b));
  const visible = items.data?.filter(
    (i) =>
      (!category || i.category === category) &&
      (!status || i.status === status) &&
      (!holder ||
        (holder === IN_STORE
          ? inStore(i) > 0
          : i.assignments.some((a) => a.assignedTo === holder))) &&
      matches(
        search,
        i.tag,
        i.name,
        i.category,
        i.serialNumber,
        ...i.assignments.map((a) => a.assignedTo),
        i.supplierName,
        i.notes,
      ),
  );
  const pager = usePagination(
    visible,
    JSON.stringify([search, category, status, holder]),
  );

  const owned = all.filter(OWNED);
  const tiles = [
    {
      label: "Items owned",
      value: String(owned.reduce((sum, i) => sum + i.quantity, 0)),
    },
    {
      label: "Value of items owned",
      value: money.format(owned.reduce((sum, i) => sum + itemValue(i), 0)),
    },
    {
      label: "Under repair",
      value: String(
        all
          .filter((i) => i.status === "under_repair")
          .reduce((sum, i) => sum + i.quantity, 0),
      ),
    },
    {
      label: "Lost or stolen",
      value: String(
        all
          .filter((i) => i.status === "lost")
          .reduce((sum, i) => sum + i.quantity, 0),
      ),
    },
  ];

  const remove = async (item: StoreItem) => {
    setRemoving(null);
    setError(null);
    try {
      const res = await apiFetch(`/store-items/${item.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Could not remove item");
      setNotice(`${item.name} removed.`);
      await items.reload();
    } catch (e) {
      setError(describeError(e, "Could not remove item"));
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Store items</h1>
        <button onClick={() => setEditing("new")} className={PRIMARY_BUTTON}>
          Add item
        </button>
      </div>
      <p className="mt-1 text-sm text-muted">
        Things the shop owns for its own use, such as phones, laptops, uniforms
        and furniture. Products for sale are in Inventory.
      </p>
      <Notice text={notice} />
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {removing && (
        <ConfirmDialog
          title="Remove item"
          message={`Remove ${removing.name} from the list? To keep a record of it, edit it and set its status to "Disposed of" or "Lost or stolen" instead.`}
          confirmLabel="Remove"
          danger
          onConfirm={() => remove(removing)}
          onClose={() => setRemoving(null)}
        />
      )}
      {editing && (
        <Modal
          title={editing === "new" ? "Add a store item" : "Edit store item"}
          onClose={() => setEditing(null)}
          wide
        >
          <StoreItemForm
            item={editing === "new" ? undefined : editing}
            categories={categories}
            onCancel={() => setEditing(null)}
            onSaved={(message) => {
              setEditing(null);
              setNotice(message);
              void items.reload();
            }}
          />
        </Modal>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg bg-white p-5 shadow-sm">
            <p className="text-sm text-muted">{t.label}</p>
            <p className="mt-1 text-2xl font-semibold">{t.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="min-w-64 flex-1">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search by code, name, serial number, who has it…"
          />
        </div>
        <select
          aria-label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={SELECT}
        >
          <option value="">All categories</option>
          {categories
            .filter((c) => all.some((i) => i.category === c))
            .map((c) => (
              <option key={c}>{c}</option>
            ))}
        </select>
        <select
          aria-label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as StoreItemStatus | "")}
          className={SELECT}
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Who has it"
          value={holder}
          onChange={(e) => setHolder(e.target.value)}
          className={SELECT}
        >
          <option value="">Anyone</option>
          <option value={IN_STORE}>Still in store</option>
          {holders.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4">
        {items.failed ? (
          <LoadError />
        ) : !items.data || !visible ? (
          <Loading />
        ) : items.data.length === 0 ? (
          <p className="text-sm text-muted">
            No store items yet. Use Add item to record the first one.
          </p>
        ) : visible.length === 0 ? (
          <NoMatches />
        ) : (
          <table className="w-full overflow-hidden rounded-lg bg-white text-left text-sm shadow-sm">
            <thead className="bg-surface-alt text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="w-12 px-4 py-3 text-right">#</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Cost</th>
                <th className="px-4 py-3">Bought</th>
                <th className="px-4 py-3">Who has it</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {pager.pageItems?.map((item, index) => (
                <tr key={item.id} className="align-top">
                  <td className="px-4 py-3 text-right text-muted tabular-nums">
                    {pager.start + index + 1}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <ItemCode tag={item.tag} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{item.name}</span>
                    <span className="block text-xs text-muted">
                      {item.category}
                      {item.serialNumber && ` · S/N ${item.serialNumber}`}
                    </span>
                    {item.notes && (
                      <p className="mt-0.5 whitespace-pre-line text-xs text-muted">
                        {item.notes}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {item.quantity}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {item.unitCost !== undefined ? (
                      <>
                        <span className="font-medium">
                          {money.format(itemValue(item))}
                        </span>
                        {item.quantity > 1 && (
                          <span className="block text-xs text-muted">
                            {money.format(item.unitCost)} each
                          </span>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {item.boughtOn ? formatDay(item.boughtOn) : "—"}
                    {item.supplierName && (
                      <span className="block text-xs text-muted">
                        {item.supplierName}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Holders item={item} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[item.status]}`}
                    >
                      {STATUS_LABELS[item.status]}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button
                      onClick={() => setEditing(item)}
                      className="font-medium text-brand-deep hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setRemoving(item)}
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
      <Pagination pager={pager} label="items" />
    </div>
  );
}

/** The shop's own code for an item, styled like a label. */
function ItemCode({ tag }: { tag: string }) {
  return (
    <span className="rounded-md border border-line-strong bg-white px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wide text-brand-deep">
      {tag}
    </span>
  );
}

function StoreItemForm({
  item,
  categories,
  onSaved,
  onCancel,
}: {
  item?: StoreItem;
  categories: string[];
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const suppliers = useLoad(fetchSuppliers);
  const staff = useLoad(fetchStaff);
  const [form, setForm] = useState({
    name: item?.name ?? "",
    category: item?.category ?? "",
    quantity: String(item?.quantity ?? 1),
    unitCost: item?.unitCost?.toString() ?? "",
    boughtOn: item?.boughtOn ?? (item ? "" : today()),
    supplierId: item?.supplierId ?? "",
    serialNumber: item?.serialNumber ?? "",
    status: item?.status ?? ("in_use" as StoreItemStatus),
    notes: item?.notes ?? "",
  });
  // Who has how many; quantities are kept as typed until saving.
  const [assignments, setAssignments] = useState(
    (item?.assignments ?? []).map((a) => ({
      assignedTo: a.assignedTo,
      quantity: String(a.quantity),
    })),
  );
  const handedOut = assignments.reduce(
    (sum, a) => sum + (Number(a.quantity) || 0),
    0,
  );
  const left = (Number(form.quantity) || 0) - handedOut;
  const updateAssignment = (
    index: number,
    change: Partial<(typeof assignments)[number]>,
  ) =>
    setAssignments(
      assignments.map((a, i) => (i === index ? { ...a, ...change } : a)),
    );
  // Only when adding: the purchase can also go into Expenses.
  const [recordExpense, setRecordExpense] = useState(false);
  const [paymentMethod, setPaymentMethod] =
    useState<ExpensePaymentMethod>("transfer");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = Number(form.unitCost || 0) * Number(form.quantity || 0);
  const set =
    (key: keyof typeof form) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) =>
      setForm({ ...form, [key]: e.target.value });

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(
        item ? `/store-items/${item.id}` : "/store-items",
        {
          method: item ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            quantity: Number(form.quantity),
            unitCost: form.unitCost === "" ? null : Number(form.unitCost),
            assignments: assignments.map((a) => ({
              assignedTo: a.assignedTo,
              quantity: Number(a.quantity),
            })),
            ...(!item && recordExpense
              ? { recordExpense: true, paymentMethod }
              : {}),
          }),
        },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not save item");
      onSaved(
        item
          ? `${body.name} updated.`
          : `${body.name} added${recordExpense ? " and recorded in Expenses" : ""}.`,
      );
    } catch (e) {
      setError(describeError(e, "Could not save item"));
      setSaving(false);
    }
  };

  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <datalist id="store-item-categories">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="store-item-people">
        {(staff.data ?? []).map((m) => (
          <option key={m.id} value={m.name} />
        ))}
      </datalist>
      <p className="text-sm text-muted sm:col-span-2">
        {item ? (
          <>
            Code <ItemCode tag={item.tag} /> — given automatically, it stays the
            same.
          </>
        ) : (
          "A code like BBA-0001 is given automatically when you save, for labelling the item."
        )}
      </p>
      <label className="text-sm font-medium sm:col-span-2">
        What is it?
        <input
          autoFocus
          required
          placeholder="e.g. Samsung A15 phone, Staff T-shirt"
          value={form.name}
          onChange={set("name")}
          className={INPUT}
        />
      </label>
      <label className="text-sm font-medium">
        Category
        <input
          required
          list="store-item-categories"
          placeholder="e.g. Phones & tablets"
          value={form.category}
          onChange={set("category")}
          className={INPUT}
        />
      </label>
      <label className="text-sm font-medium">
        Status
        <select value={form.status} onChange={set("status")} className={INPUT}>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium">
        Quantity
        <input
          required
          type="number"
          min={1}
          step={1}
          value={form.quantity}
          onChange={set("quantity")}
          className={INPUT}
        />
      </label>
      <label className="text-sm font-medium">
        Cost of one <span className="font-normal text-muted">(optional)</span>
        <input
          type="number"
          min={0}
          step="any"
          value={form.unitCost}
          onChange={set("unitCost")}
          className={INPUT}
        />
      </label>
      <label className="text-sm font-medium">
        Date bought <span className="font-normal text-muted">(optional)</span>
        <input
          type="date"
          max={today()}
          value={form.boughtOn}
          onChange={set("boughtOn")}
          className={INPUT}
        />
      </label>
      <label className="text-sm font-medium">
        Supplier <span className="font-normal text-muted">(optional)</span>
        <select
          value={form.supplierId}
          onChange={set("supplierId")}
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
      <label className="text-sm font-medium sm:col-span-2">
        Serial or IMEI number{" "}
        <span className="font-normal text-muted">(optional)</span>
        <input
          value={form.serialNumber}
          onChange={set("serialNumber")}
          className={INPUT}
        />
      </label>
      <div className="text-sm sm:col-span-2">
        <p className="font-medium">
          Who has it{" "}
          <span className="font-normal text-muted">
            (people, or places like &ldquo;Front counter&rdquo;)
          </span>
        </p>
        {assignments.map((a, index) => (
          <div key={index} className="mt-2 flex gap-2">
            <div className="min-w-0 flex-1">
              <input
                required
                aria-label={`Assigned to ${index + 1}`}
                list="store-item-people"
                placeholder="Name or place"
                value={a.assignedTo}
                onChange={(e) =>
                  updateAssignment(index, { assignedTo: e.target.value })
                }
                className={INPUT}
              />
            </div>
            <div className="w-24 shrink-0">
              <input
                required
                aria-label={`How many ${index + 1}`}
                type="number"
                min={1}
                step={1}
                value={a.quantity}
                onChange={(e) =>
                  updateAssignment(index, { quantity: e.target.value })
                }
                className={INPUT}
              />
            </div>
            <button
              type="button"
              aria-label="Remove"
              onClick={() =>
                setAssignments(assignments.filter((_, i) => i !== index))
              }
              className="rounded-md px-3 text-muted hover:bg-brand-soft"
            >
              ×
            </button>
          </div>
        ))}
        <div className="mt-2 flex items-center justify-between">
          <button
            type="button"
            disabled={left <= 0}
            onClick={() =>
              setAssignments([
                ...assignments,
                { assignedTo: "", quantity: String(Math.min(1, left)) },
              ])
            }
            className="font-medium text-brand-deep hover:underline disabled:text-muted disabled:no-underline"
          >
            + Assign to someone
          </button>
          <span
            className={left < 0 ? "font-medium text-red-700" : "text-muted"}
          >
            {left < 0
              ? `${-left} more assigned than you have`
              : `${left} still in store`}
          </span>
        </div>
      </div>
      <label className="text-sm font-medium sm:col-span-2">
        Notes <span className="font-normal text-muted">(optional)</span>
        <textarea
          rows={2}
          placeholder="e.g. Warranty until June 2027, size L"
          value={form.notes}
          onChange={set("notes")}
          className={INPUT}
        />
      </label>

      {!item && (
        <div className="rounded-lg border border-line bg-surface-alt px-4 py-3 text-sm sm:col-span-2">
          <label className="flex items-center gap-2 font-medium">
            <input
              type="checkbox"
              checked={recordExpense}
              onChange={(e) => setRecordExpense(e.target.checked)}
              className="h-4 w-4 accent-brand"
            />
            Also record this purchase in Expenses
            {total > 0 && (
              <span className="font-normal text-muted">
                ({money.format(total)})
              </span>
            )}
          </label>
          {recordExpense && (
            <label className="mt-2 flex items-center gap-2">
              Paid by
              <select
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(e.target.value as ExpensePaymentMethod)
                }
                className={SELECT}
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
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-700 sm:col-span-2">{error}</p>}
      <div className="mt-2 flex justify-end gap-3 sm:col-span-2">
        <button type="button" onClick={onCancel} className={SECONDARY_BUTTON}>
          Cancel
        </button>
        <button type="submit" disabled={saving} className={PRIMARY_BUTTON}>
          {saving ? "Saving…" : item ? "Save changes" : "Add item"}
        </button>
      </div>
    </form>
  );
}
