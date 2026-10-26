import type { RequestStatus, StoreRequest } from "@pos/types";

export const STATUS_LABELS: Record<RequestStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  done: "Done",
};

const STATUS_STYLES: Record<RequestStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
  done: "bg-surface-alt text-muted",
};

/** A request's status, with when it was decided and the admin's note. */
export default function RequestStatusCell({
  request,
}: {
  request: StoreRequest;
}) {
  return (
    <>
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[request.status]}`}
      >
        {STATUS_LABELS[request.status]}
      </span>
      {request.decidedAt && (
        <p className="mt-1 whitespace-nowrap text-xs text-muted">
          {new Date(request.decidedAt).toLocaleString()}
        </p>
      )}
      {request.decisionNote && (
        <p className="mt-1 whitespace-pre-line text-xs">
          {request.decisionNote}
        </p>
      )}
    </>
  );
}
