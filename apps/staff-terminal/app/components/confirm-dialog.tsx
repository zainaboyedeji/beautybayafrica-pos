"use client";

import { useState } from "react";
import { INPUT, PRIMARY_BUTTON, SECONDARY_BUTTON } from "./form-styles";
import Modal from "./modal";

type Props = {
  title: string;
  message: string;
  confirmLabel: string;
  /** Shows a box for an optional note, passed to `onConfirm`. */
  withNote?: boolean;
  danger?: boolean;
  onConfirm: (note: string) => Promise<void>;
  onClose: () => void;
};

/**
 * Asks before doing something. Used instead of window.confirm / prompt,
 * which the desktop app's webview on macOS ignores.
 */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  withNote,
  danger,
  onConfirm,
  onClose,
}: Props) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          void onConfirm(note.trim()).finally(() => setBusy(false));
        }}
      >
        <p className="text-sm">{message}</p>
        {withNote && (
          <label className="mt-4 block text-sm font-medium">
            Note <span className="font-normal text-muted">(optional)</span>
            <textarea
              autoFocus
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={INPUT}
            />
          </label>
        )}
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
            Cancel
          </button>
          <button
            type="submit"
            autoFocus={!withNote}
            disabled={busy}
            className={
              danger
                ? "rounded-lg bg-red-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-40"
                : PRIMARY_BUTTON
            }
          >
            {busy ? "Saving…" : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
