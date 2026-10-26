"use client";

import { useState } from "react";
import { apiFetch, describeError, type StaffMember } from "../lib/api";
import { INPUT, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./form-styles";
import Modal from "./modal";

type Props = {
  staff: StaffMember[];
  /** The staff member to start with, when known. */
  staffId?: string;
  /** Who asked, shown when the request couldn't be matched to staff. */
  requestedBy?: string;
  /** The PIN request being answered; the server marks it done. */
  requestId?: string;
  onSaved: (member: StaffMember) => Promise<void> | void;
  onClose: () => void;
};

/** Gives a staff member a new PIN, e.g. when they have forgotten theirs. */
export default function SetPinDialog({
  staff,
  staffId,
  requestedBy,
  requestId,
  onSaved,
  onClose,
}: Props) {
  const [memberId, setMemberId] = useState(staffId ?? "");
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const member = staff.find((m) => m.id === memberId);
    if (!member) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/staff/${member.id}/pin`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, requestId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not set PIN");
      await onSaved(member);
    } catch (e) {
      setError(describeError(e, "Could not set PIN"));
      setSaving(false);
    }
  };

  return (
    <Modal title="Set a new PIN" onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {requestedBy && !staffId && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            &ldquo;{requestedBy}&rdquo; doesn&apos;t match a staff name exactly.
            Choose who it is.
          </p>
        )}
        <label className="text-sm font-medium">
          Staff member
          <select
            required
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
            className={INPUT}
          >
            <option value="">Choose…</option>
            {staff.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.role ? ` (${m.role})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          New PIN (4–8 digits)
          <input
            autoFocus={!!staffId}
            required
            inputMode="numeric"
            pattern="\d{4,8}"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className={INPUT}
          />
        </label>
        <p className="text-xs text-muted">
          Their old PIN stops working straight away. Tell them the new one in
          person.
        </p>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="mt-2 flex justify-end gap-3">
          <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={PRIMARY_BUTTON}>
            {saving ? "Saving…" : "Set PIN"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
