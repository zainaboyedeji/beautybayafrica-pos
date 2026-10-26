"use client";

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

  return (
    <div className="flex min-h-screen text-ink">
      <FeatureShowcase />
      <div className="flex flex-1 items-center justify-center bg-surface-alt p-6">
        <form
          className="w-full max-w-sm rounded-xl bg-white p-6 shadow-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Beauty Bay Africa"
            className="mx-auto h-20 w-20"
          />
          <p className="mt-3 text-center text-sm font-medium tracking-wide text-brand-deep">
            Beauty Bay Africa
          </p>
          <h1 className="mt-4 text-2xl font-semibold">Log in</h1>
          <div className="mt-5 grid grid-cols-2 gap-2 rounded-lg bg-surface-alt p-1 text-sm font-medium">
            {(["staff", "admin"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setSecret("");
                  setShowSecret(false);
                  setError(null);
                }}
                className={`rounded-md py-2 ${
                  mode === m ? "bg-white shadow-sm" : "text-muted"
                }`}
              >
                {m === "staff" ? "Staff" : "Admin"}
              </button>
            ))}
          </div>
          <label className="mt-5 block text-sm font-medium">
            {mode === "staff" ? "PIN" : "Admin password"}
            <div className="relative">
              <input
                key={mode}
                autoFocus
                required
                type={showSecret ? "text" : "password"}
                inputMode={mode === "staff" ? "numeric" : undefined}
                autoComplete={mode === "admin" ? "current-password" : "off"}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className={`${INPUT} pr-11`}
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
          {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className={`${PRIMARY_BUTTON} mt-5 w-full`}
          >
            {saving ? "Logging in…" : "Log in"}
          </button>
        </form>
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
