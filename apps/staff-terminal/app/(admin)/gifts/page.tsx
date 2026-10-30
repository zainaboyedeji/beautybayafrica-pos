"use client";

import { useState, type ChangeEvent } from "react";
import type { Gift } from "@pos/types";
import { Notice } from "../../components/action-modals";
import {
  INPUT,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
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
  fetchGifts,
  money,
  useLoad,
} from "../../lib/api";
import { LoadError, Loading } from "../../lib/status";
import PageHeader from "../../components/page-header";

const EMPTY_FORM = {
  name: "",
  quantity: "0",
  unitCost: "",
  minSpend: "",
  notes: "",
};

/** At or below this many left, a gift is shown as running low. */
const LOW_GIFTS = 5;

export default function GiftsPage() {
  const gifts = useLoad(fetchGifts);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  // null: closed; "new": adding; a gift: editing it.
  const [editing, setEditing] = useState<Gift | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Gift | null>(null);

  const visible = gifts.data?.filter((g) => matches(search, g.name, g.notes));

  const remove = async (gift: Gift) => {
    setRemoving(null);
    setError(null);
    try {
      const res = await apiFetch(`/gifts/${gift.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not remove the gift");
      setNotice(`${gift.name} removed.`);
      await gifts.reload();
    } catch (e) {
      setError(describeError(e, "Could not remove the gift"));
    }
  };

  const pager = usePagination(visible, JSON.stringify([search]));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        icon="gift"
        section="Shop"
        title="Free gifts"
        description="Samples, minis and other things given away with sales. At the till, each sale gets one at random from the gifts in stock at the highest minimum spend it reaches. You can also add gifts by hand from Record sale on the Sales page."
      >
        <button onClick={() => setEditing("new")} className={PRIMARY_BUTTON}>
          Add gift
        </button>
      </PageHeader>
      <Notice text={notice} />
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {removing && (
        <ConfirmDialog
          title="Remove gift"
          message={`Remove ${removing.name}? Sales it was given with still show it.`}
          confirmLabel="Remove"
          danger
          onConfirm={() => remove(removing)}
          onClose={() => setRemoving(null)}
        />
      )}
      {editing && (
        <Modal
          title={editing === "new" ? "Add a free gift" : "Edit gift"}
          onClose={() => setEditing(null)}
        >
          <GiftForm
            gift={editing === "new" ? undefined : editing}
            onCancel={() => setEditing(null)}
            onSaved={(message) => {
              setEditing(null);
              setNotice(message);
              void gifts.reload();
            }}
          />
        </Modal>
      )}

      <div className="mt-6">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search gifts"
        />
      </div>

      <div className="mt-4">
        {gifts.failed ? (
          <LoadError />
        ) : !gifts.data || !visible ? (
          <Loading />
        ) : gifts.data.length === 0 ? (
          <p className="text-sm text-muted">No free gifts yet.</p>
        ) : visible.length === 0 ? (
          <NoMatches />
        ) : (
          <div className={TABLE_CARD}>
            <table className={TABLE}>
              <thead className={THEAD}>
                <tr>
                  <th className="px-4 py-3">Gift</th>
                  <th className="px-4 py-3 text-right">In stock</th>
                  <th className="px-4 py-3 text-right">Given out</th>
                  <th className="px-4 py-3 text-right">Minimum spend</th>
                  <th className="px-4 py-3 text-right">Cost each</th>
                  <th className="px-4 py-3">Notes</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pager.pageItems?.map((g) => (
                  <tr key={g.id} className="align-top">
                    <td className="px-4 py-3 font-medium">{g.name}</td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={
                          g.quantity === 0
                            ? "font-semibold text-red-700"
                            : g.quantity <= LOW_GIFTS
                              ? "font-semibold text-amber-700"
                              : ""
                        }
                      >
                        {g.quantity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">{g.given}</td>
                    <td className="px-4 py-3 text-right">
                      {g.minSpend !== undefined ? (
                        money.format(g.minSpend)
                      ) : (
                        <span className="text-muted">By hand only</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {g.unitCost !== undefined
                        ? money.format(g.unitCost)
                        : "—"}
                    </td>
                    <td className="whitespace-pre-line px-4 py-3 text-muted">
                      {g.notes ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button
                        onClick={() => setEditing(g)}
                        className="font-medium text-brand-deep hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setRemoving(g)}
                        className="ml-4 font-medium text-red-700 hover:underline"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Pagination pager={pager} label="gifts" />
    </div>
  );
}

function GiftForm({
  gift,
  onSaved,
  onCancel,
}: {
  gift?: Gift;
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(
    gift
      ? {
          name: gift.name,
          quantity: String(gift.quantity),
          unitCost: gift.unitCost !== undefined ? String(gift.unitCost) : "",
          minSpend: gift.minSpend !== undefined ? String(gift.minSpend) : "",
          notes: gift.notes ?? "",
        }
      : EMPTY_FORM,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(gift ? `/gifts/${gift.id}` : "/gifts", {
        method: gift ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not save the gift");
      onSaved(`${body.name} ${gift ? "updated" : "added"}.`);
    } catch (e) {
      setError(describeError(e, "Could not save the gift"));
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
        Gift
        <input
          autoFocus
          required
          placeholder="e.g. Tote bag, Serum sample 5ml"
          {...field("name")}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          How many you have
          <input
            required
            type="number"
            min={0}
            step={1}
            {...field("quantity")}
          />
        </label>
        <label className="text-sm font-medium">
          Cost each <span className="font-normal text-muted">(optional)</span>
          <input type="number" min={0} step="0.01" {...field("unitCost")} />
        </label>
      </div>
      <label className="text-sm font-medium">
        Minimum spend
        <input
          type="number"
          min={0}
          step="0.01"
          placeholder="e.g. 20000"
          {...field("minSpend")}
        />
        <span className="mt-1 block text-xs font-normal text-muted">
          Till sales of at least this much can get this gift. Gifts with the
          same minimum spend are given at random. Leave empty to only give it by
          hand from Record sale.
        </span>
      </label>
      <label className="text-sm font-medium">
        Notes <span className="font-normal text-muted">(optional)</span>
        <textarea rows={3} {...field("notes")} />
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="mt-2 flex justify-end gap-3">
        <button type="button" onClick={onCancel} className={SECONDARY_BUTTON}>
          Cancel
        </button>
        <button type="submit" disabled={saving} className={PRIMARY_BUTTON}>
          {saving ? "Saving…" : gift ? "Save changes" : "Add gift"}
        </button>
      </div>
    </form>
  );
}
