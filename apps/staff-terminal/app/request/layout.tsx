import type { ReactNode } from "react";
import RequireLogin from "../components/require-login";

// Everyone who can log in (admin and staff) can make a request.
export default function RequestLayout({ children }: { children: ReactNode }) {
  return <RequireLogin allowed={["admin", "staff"]}>{children}</RequireLogin>;
}
