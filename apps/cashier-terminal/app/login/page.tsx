"use client";

import { useState } from "react";
import { INPUT, PRIMARY_BUTTON } from "../components/form-styles";
import { API_URL, describeError } from "../lib/api";
import { saveSession, type Session } from "../lib/auth";

type Mode = "cashier" | "admin";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("cashier");
  const [secret, setSecret] = useState("");
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
    <div className="flex min-h-screen items-center justify-center bg-surface-alt p-6 text-ink">
      <form
        className="w-full max-w-sm rounded-xl bg-white p-6 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h1 className="text-2xl font-semibold">Log in</h1>
        <div className="mt-5 grid grid-cols-2 gap-2 rounded-lg bg-surface-alt p-1 text-sm font-medium">
          {(["cashier", "admin"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setSecret("");
                setError(null);
              }}
              className={`rounded-md py-2 ${
                mode === m ? "bg-white shadow-sm" : "text-muted"
              }`}
            >
              {m === "cashier" ? "Cashier" : "Admin"}
            </button>
          ))}
        </div>
        <label className="mt-5 block text-sm font-medium">
          {mode === "cashier" ? "PIN" : "Admin password"}
          <input
            key={mode}
            autoFocus
            required
            type="password"
            inputMode={mode === "cashier" ? "numeric" : undefined}
            autoComplete={mode === "admin" ? "current-password" : "off"}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className={INPUT}
          />
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
  );
}
