"use client";

import Link from "next/link";
import { useState } from "react";
import { INPUT, PRIMARY_BUTTON } from "../components/form-styles";
import { API_URL, describeError } from "../lib/api";
import { saveSession, type Session } from "../lib/auth";
import FeatureShowcase from "./feature-showcase";

type Mode = "staff" | "admin";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("staff");
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "admin" ? { password: secret } : { pin: secret },
        ),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not log in");
      saveSession(body as Session);
      window.location.replace(body.role === "admin" ? "/" : "/pos");
    } catch (e) {
      setError(describeError(e, "Could not log in"));
      setSecret("");
      setSaving(false);
    }
  };

  const isStaff = mode === "staff";

  return (
    <div className="flex min-h-screen text-ink">
      <FeatureShowcase />
      <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-surface-alt to-white p-6">
        {/* One soft glow behind the card; nothing moves. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-soft/60 blur-3xl"
        />
        <form
          className="relative w-full max-w-sm rounded-2xl border border-line bg-white px-7 py-8 shadow-lg shadow-brand-deep/5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="flex flex-col items-center text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" className="h-16 w-16" />
            <p className="mt-2 text-xs font-medium uppercase tracking-[0.2em] text-brand-deep">
              Beauty Bay Africa
            </p>
            <h1 className="mt-5 text-3xl">Welcome back</h1>
            <p className="mt-1.5 text-sm text-muted">
              {isStaff
                ? "Enter your PIN to open the till."
                : "Enter the admin password to open the back office."}
            </p>
          </div>

          <div
            role="tablist"
            aria-label="Log in as"
            className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-surface-alt p-1 text-sm font-medium"
          >
            {(["staff", "admin"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  setSecret("");
                  setShowSecret(false);
                  setError(null);
                }}
                className={`rounded-lg py-2 transition-colors ${
                  mode === m
                    ? "bg-white text-brand-deep shadow-sm"
                    : "text-muted hover:text-ink"
                }`}
              >
                {m === "staff" ? "Staff" : "Admin"}
              </button>
            ))}
          </div>

          <label className="mt-6 block text-sm font-medium">
            {isStaff ? "PIN" : "Password"}
            <div className="relative">
              <input
                key={mode}
                autoFocus
                required
                type={showSecret ? "text" : "password"}
                inputMode={isStaff ? "numeric" : undefined}
                autoComplete={isStaff ? "off" : "current-password"}
                placeholder={isStaff ? "••••" : undefined}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className={`${INPUT} h-12 pr-11 ${
                  // Padding on both sides keeps the PIN centred past the eye button.
                  isStaff ? "pl-11 text-center text-lg tracking-[0.4em]" : ""
                }`}
              />
              <button
                type="button"
                onClick={() => setShowSecret((s) => !s)}
                aria-label={showSecret ? "Hide" : "Show"}
                aria-pressed={showSecret}
                className="absolute inset-y-0 right-0 mt-1 flex w-10 items-center justify-center rounded-r-md text-muted hover:text-brand-deep"
              >
                <EyeIcon open={showSecret} />
              </button>
            </div>
          </label>
          {error && (
            <p
              role="alert"
              className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={saving}
            className={`${PRIMARY_BUTTON} mt-6 h-12 w-full`}
          >
            {saving ? "Logging in…" : "Log in"}
          </button>
        </form>
        {isStaff ? (
          <Link
            href="/forgot-pin"
            className="relative mt-6 text-center text-xs font-medium text-muted hover:text-brand-deep"
          >
            Forgot your PIN? Request a new one
          </Link>
        ) : (
          <p className="relative mt-6 text-center text-xs text-muted">
            Staff log in with their PIN on the Staff tab.
          </p>
        )}
      </div>
    </div>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      {!open && <path d="M3 3l18 18" />}
    </svg>
  );
}
