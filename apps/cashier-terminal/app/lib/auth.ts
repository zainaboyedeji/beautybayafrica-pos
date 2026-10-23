"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

export type Role = "admin" | "cashier";
export type Session = { token: string; role: Role; name: string };

const STORAGE_KEY = "pos-session";

const readSaved = () => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

const parse = (saved: string | null): Session | null => {
  try {
    return saved ? (JSON.parse(saved) as Session) : null;
  } catch {
    return null;
  }
};

export const getSession = () => parse(readSaved());

export function saveSession(session: Session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function logOut() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
  // A full reload so no data from the previous user stays in memory.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/login");
}

const subscribe = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
};

/**
 * The logged-in user, or null while checking. Sends anyone not logged in to
 * the login page, and cashiers away from admin-only pages.
 */
export function useSession(allowed: Role[]) {
  const router = useRouter();
  // `undefined` while pre-rendering, before the browser storage can be read.
  const saved = useSyncExternalStore(subscribe, readSaved, () => undefined);
  const session = saved === undefined ? null : parse(saved);
  const permitted = session !== null && allowed.includes(session.role);
  const loggedIn = session !== null;

  useEffect(() => {
    if (saved === undefined || permitted) return;
    router.replace(loggedIn ? "/pos" : "/login");
  }, [saved, permitted, loggedIn, router]);

  return permitted ? session : null;
}
