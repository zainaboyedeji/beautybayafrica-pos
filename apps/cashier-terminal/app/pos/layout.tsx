import type { ReactNode } from "react";
import RequireLogin from "../components/require-login";

export default function PosLayout({ children }: { children: ReactNode }) {
  return (
    <RequireLogin allowed={["admin", "cashier"]}>{children}</RequireLogin>
  );
}
