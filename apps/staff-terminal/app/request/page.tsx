"use client";

import { useState } from "react";
import { Notice } from "../components/action-modals";
import ConfirmDialog from "../components/confirm-dialog";
import {
  CARD,
  INPUT,
  PRIMARY_BUTTON,
  TABLE,
  TABLE_CARD,
  THEAD,
} from "../components/form-styles";
import RequestStatusCell from "../components/request-status";
import TopBar from "../components/top-bar";
import {
  apiFetch,
  describeError,
  fetchMyRequests,
  money,
  useLoad,
} from "../lib/api";
import { getSession } from "../lib/auth";
import { LoadError, Loading } from "../lib/status";

const EMPTY_FORM = { title: "", requestedBy: "", amount: "", details: "" };

/** Where staff make official requests and follow what the admin decided. */
export default function RequestPage() {
  // RequireLogin only renders this page once someone is logged in.
  const session = getSession();
  const isAdmin = session?.role === "admin";
  const mine = useLoad(fetchMyRequests);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [askingPin, setAskingPin] = useState(false);
  const pinRequested = mine.data?.some(
    (r) => r.kind === "pin_reset" && r.status === "pending",
  );

  const askForPin = async () => {
    setAskingPin(false);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch("/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "pin_reset" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not send request");
      setNotice("PIN request sent. The admin will give you a new PIN.");
      await mine.reload();
    } catch (e) {
      setError(describeError(e, "Could not send request"));
    }
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch("/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          amount: form.amount === "" ? null : Number(form.amount),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not send request");
      setForm(EMPTY_FORM);
      setNotice(
        `Request "${body.title}" sent to the admin. Its status shows below.`,
      );
      await mine.reload();
    } catch (e) {
      setError(describeError(e, "Could not send request"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen p-3 text-ink">
      <TopBar
        title="Requests"
        name={session?.name}
        links={[
          { href: "/pos", label: "Till", icon: "arrowLeft" },
          ...(isAdmin
            ? [
                {
                  href: "/requests",
                  label: "Approve requests",
                  icon: "check" as const,
                },
              ]
            : []),
        ]}
      />

      <main className="mx-auto max-w-4xl animate-fade-up px-5 py-8">
        {askingPin && (
          <ConfirmDialog
            title="Ask for a new PIN"
            message="The admin will be asked to give you a new PIN. Your current PIN keeps working until they do."
            confirmLabel="Send request"
            onConfirm={askForPin}
            onClose={() => setAskingPin(false)}
          />
        )}
        {!isAdmin && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-white px-5 py-3 text-sm shadow-soft ring-1 ring-line">
            <span className="text-muted">
              {pinRequested
                ? "Your PIN request is with the admin."
                : "Need a new PIN? Ask the admin to change it."}
            </span>
            {!pinRequested && (
              <button
                type="button"
                onClick={() => setAskingPin(true)}
                className="font-medium text-brand-deep hover:underline"
              >
                Ask for a new PIN
              </button>
            )}
          </div>
        )}
        <form
          className={`${CARD} flex flex-col gap-3`}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <h2 className="text-2xl font-semibold">Make a request</h2>
          <p className="text-sm text-muted">
            For money, stock, repairs, time off or anything that needs the
            admin&apos;s approval. Every request is saved with your name and the
            date.
          </p>
          <label className="text-sm font-medium">
            What are you requesting?
            <input
              required
              placeholder="e.g. Money for new shelves"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className={INPUT}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            {isAdmin ? (
              <label className="text-sm font-medium">
                Requested by{" "}
                <span className="font-normal text-muted">
                  (leave empty for yourself)
                </span>
                <input
                  value={form.requestedBy}
                  onChange={(e) =>
                    setForm({ ...form, requestedBy: e.target.value })
                  }
                  className={INPUT}
                />
              </label>
            ) : (
              <div className="text-sm font-medium">
                Requested by
                <p className="mt-1 rounded-xl bg-surface-alt px-3.5 py-2.5 font-normal ring-1 ring-line">
                  {session?.name}
                </p>
              </div>
            )}
            <label className="text-sm font-medium">
              Amount <span className="font-normal text-muted">(optional)</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className={INPUT}
              />
            </label>
          </div>
          <label className="text-sm font-medium">
            Details <span className="font-normal text-muted">(optional)</span>
            <textarea
              rows={4}
              placeholder="Why it is needed, quantities, deadline…"
              value={form.details}
              onChange={(e) => setForm({ ...form, details: e.target.value })}
              className={INPUT}
            />
          </label>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <div className="flex justify-end">
            <button type="submit" disabled={saving} className={PRIMARY_BUTTON}>
              {saving ? "Sending…" : "Send request"}
            </button>
          </div>
        </form>
        <Notice text={notice} />

        <h2 className="mt-10 text-2xl font-semibold">
          {isAdmin ? "Requests you made" : "Your requests"}
        </h2>
        <div className="mt-3">
          {mine.failed ? (
            <LoadError />
          ) : !mine.data ? (
            <Loading />
          ) : mine.data.length === 0 ? (
            <p className="text-sm text-muted">No requests yet.</p>
          ) : (
            <div className={TABLE_CARD}>
              <table className={TABLE}>
                <thead className={THEAD}>
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Request</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {mine.data.map((r) => (
                    <tr key={r.id} className="align-top">
                      <td className="whitespace-nowrap px-4 py-3">
                        {new Date(r.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium">{r.title}</span>
                        {isAdmin && r.requestedBy !== session?.name && (
                          <span className="text-muted">
                            {" "}
                            · for {r.requestedBy}
                          </span>
                        )}
                        {r.details && (
                          <p className="mt-0.5 whitespace-pre-line text-muted">
                            {r.details}
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {r.amount !== undefined ? money.format(r.amount) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <RequestStatusCell request={r} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
