"use client";

import Link from "next/link";
import { useState } from "react";
import { Notice } from "../components/action-modals";
import { INPUT, PRIMARY_BUTTON } from "../components/form-styles";
import RequestStatusCell from "../components/request-status";
import {
  apiFetch,
  describeError,
  fetchMyRequests,
  money,
  useLoad,
} from "../lib/api";
import { getSession, logOut } from "../lib/auth";
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
    <div className="min-h-screen bg-surface-alt text-ink">
      <header className="flex items-center gap-4 bg-ink px-6 py-3 text-white">
        <h1 className="text-lg font-semibold">Requests</h1>
        <Link
          href="/pos"
          className="rounded-md px-3 py-1.5 text-sm font-medium hover:bg-zinc-800"
        >
          ← Till
        </Link>
        {isAdmin && (
          <Link
            href="/requests"
            className="rounded-md px-3 py-1.5 text-sm font-medium hover:bg-zinc-800"
          >
            Approve requests
          </Link>
        )}
        <span className="ml-auto text-sm text-zinc-400">{session?.name}</span>
        <button
          onClick={logOut}
          className="rounded-md px-3 py-1.5 text-sm font-medium hover:bg-zinc-800"
        >
          Log out
        </button>
      </header>

      <main className="mx-auto max-w-4xl p-8">
        <form
          className="flex flex-col gap-3 rounded-lg bg-white p-5 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <h2 className="text-xl font-semibold">Make a request</h2>
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
                <p className="mt-1 rounded-md bg-surface-alt px-3 py-2 font-normal">
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

        <h2 className="mt-8 text-xl font-semibold">
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
            <table className="w-full overflow-hidden rounded-lg bg-white text-left text-sm shadow-sm">
              <thead className="bg-surface-alt text-xs uppercase tracking-wide text-muted">
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
          )}
        </div>
      </main>
    </div>
  );
}
