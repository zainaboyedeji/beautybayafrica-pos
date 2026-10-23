"use client";

import type { ReactNode } from "react";
import { useSession, type Role } from "../lib/auth";

/** Shows its children only to a logged-in user with one of the allowed roles. */
export default function RequireLogin({
  allowed,
  children,
}: {
  allowed: Role[];
  children: ReactNode;
}) {
  const session = useSession(allowed);
  return session ? children : null;
}
