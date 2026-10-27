"use client";

import Link from "next/link";
import { useState } from "react";
import { INPUT, PRIMARY_BUTTON } from "../components/form-styles";
import { API_URL, describeError } from "../lib/api";

/**
 * For staff who have forgotten their PIN and so can't log in: sends a PIN
 * request to the admin's Requests page.
 */
export default function ForgotPinPage() {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/pin-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, note }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not send request");
      setSent(true);
    } catch (e) {
      setError(describeError(e, "Could not send request"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-6 text-ink">
      <div
        aria-hidden
        className="pointer-events-none absolute left-[40%] top-[40%] h-[26rem] w-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-soft/70 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-[62%] top-[60%] h-[22rem] w-[22rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-soft/80 blur-3xl"
      />
      <div className="relative w-full max-w-sm animate-pop-in overflow-hidden rounded-3xl bg-white px-7 pb-8 pt-9 shadow-soft ring-1 ring-line">
        {/* A pink edge along the top of the card. */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-brand via-brand-hover to-violet-400"
        />
        <div className="flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt=""
            className="h-16 w-16 rounded-2xl bg-white p-1 shadow-md shadow-brand/30"
          />
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-brand-deep">
            Beauty Bay Africa
          </p>
          <h1 className="mt-4 text-4xl">
            {sent ? "Request sent" : "Forgot your PIN?"}
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {sent
              ? "The admin has your request and will give you a new PIN in person."
              : "Send a request to the admin for a new PIN."}
          </p>
        </div>

        {sent ? (
          <Link
            href="/login"
            className={`${PRIMARY_BUTTON} mt-6 flex h-12 w-full items-center justify-center`}
          >
            Back to log in
          </Link>
        ) : (
          <form
            className="mt-6 flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label className="text-sm font-medium">
              Your name
              <input
                autoFocus
                required
                placeholder="As the admin saved it"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`${INPUT} h-12`}
              />
            </label>
            <label className="text-sm font-medium">
              Note <span className="font-normal text-muted">(optional)</span>
              <textarea
                rows={2}
                placeholder="e.g. I'm on the morning shift"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className={INPUT}
              />
            </label>
            {error && (
              <p
                role="alert"
                className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100"
              >
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={saving}
              className={`${PRIMARY_BUTTON} h-12 w-full`}
            >
              {saving ? "Sending…" : "Send request"}
            </button>
          </form>
        )}
      </div>
      {!sent && (
        <Link
          href="/login"
          className="relative mt-6 text-xs font-medium text-muted hover:text-brand-deep"
        >
          ← Back to log in
        </Link>
      )}
    </div>
  );
}
