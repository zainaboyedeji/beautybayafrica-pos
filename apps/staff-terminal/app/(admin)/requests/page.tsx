"use client";

import Link from "next/link";
import { useState } from "react";
import type { RequestStatus, StoreRequest } from "@pos/types";
import { Notice } from "../../components/action-modals";
import { PRIMARY_BUTTON } from "../../components/form-styles";
import ConfirmDialog from "../../components/confirm-dialog";
import RequestStatusCell, {
  STATUS_LABELS,
} from "../../components/request-status";
import SearchBox, { matches, NoMatches } from "../../components/search-box";
import {
  apiFetch,
  describeError,
  fetchRequests,
  money,
  useLoad,
} from "../../lib/api";
import { LoadError, Loading } from "../../lib/status";

// What the admin can do next with a request in each status.
const NEXT_ACTIONS: Record<
  RequestStatus,
  { status: RequestStatus; label: string; style: string }[]
> = {
  pending: [
    { status: "approved", label: "Approve", style: "text-emerald-700" },
    { status: "rejected", label: "Reject", style: "text-red-700" },
  ],
  approved: [{ status: "done", label: "Mark done", style: "text-brand-deep" }],
  rejected: [],
  done: [],
};

export default function RequestsPage() {
  const requests = useLoad(fetchRequests);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<RequestStatus | "">("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The request being approved, rejected or marked done, and its new status.
  const [deciding, setDeciding] = useState<{
    request: StoreRequest;
    next: RequestStatus;
  } | null>(null);

  const visible = requests.data?.filter(
    (r) =>
      (!status || r.status === status) &&
      matches(search, r.title, r.details, r.requestedBy, r.decisionNote),
  );
  const count = (s: RequestStatus) =>
    (requests.data ?? []).filter((r) => r.status === s).length;

  const decide = async (
    request: StoreRequest,
    next: RequestStatus,
    note: string,
  ) => {
    setDeciding(null);
    setError(null);
    try {
      const res = await apiFetch(`/requests/${request.id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next, note }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not update request");
      setNotice(
        `"${request.title}" marked ${STATUS_LABELS[next].toLowerCase()}.`,
      );
      await requests.reload();
    } catch (e) {
      setError(describeError(e, "Could not update request"));
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Requests</h1>
        <Link href="/request" className={PRIMARY_BUTTON}>
          Make a request
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted">
        Requests made by staff from the Requests page (money, stock, repairs,
        time off). Approve or reject them here; the person who asked sees your
        decision and note.
      </p>
      <Notice text={notice} />
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {deciding && (
        <ConfirmDialog
          title={`${NEXT_ACTIONS[deciding.request.status].find((a) => a.status === deciding.next)?.label} request`}
          message={`"${deciding.request.title}" from ${deciding.request.requestedBy} will be marked ${STATUS_LABELS[deciding.next].toLowerCase()}.`}
          confirmLabel={
            NEXT_ACTIONS[deciding.request.status].find(
              (a) => a.status === deciding.next,
            )?.label ?? "Save"
          }
          withNote
          danger={deciding.next === "rejected"}
          onConfirm={(note) => decide(deciding.request, deciding.next, note)}
          onClose={() => setDeciding(null)}
        />
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="min-w-64 flex-1">
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search by request, person or note"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {(["", "pending", "approved", "rejected", "done"] as const).map(
            (s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                aria-pressed={status === s}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                  status === s
                    ? "bg-ink text-white"
                    : "bg-white text-ink shadow-sm hover:bg-brand-soft"
                }`}
              >
                {s ? `${STATUS_LABELS[s]} (${count(s)})` : "All"}
              </button>
            ),
          )}
        </div>
      </div>

      <div className="mt-4">
        {requests.failed ? (
          <LoadError />
        ) : !requests.data || !visible ? (
          <Loading />
        ) : requests.data.length === 0 ? (
          <p className="text-sm text-muted">No requests yet.</p>
        ) : visible.length === 0 ? (
          <NoMatches />
        ) : (
          <table className="w-full overflow-hidden rounded-lg bg-white text-left text-sm shadow-sm">
            <thead className="bg-surface-alt text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Request</th>
                <th className="px-4 py-3">Requested by</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{r.title}</span>
                    {r.details && (
                      <p className="mt-0.5 whitespace-pre-line text-muted">
                        {r.details}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">{r.requestedBy}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {r.amount !== undefined ? money.format(r.amount) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <RequestStatusCell request={r} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {NEXT_ACTIONS[r.status].map((a) => (
                      <button
                        key={a.status}
                        onClick={() =>
                          setDeciding({ request: r, next: a.status })
                        }
                        className={`ml-4 font-medium hover:underline ${a.style}`}
                      >
                        {a.label}
                      </button>
                    ))}
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
