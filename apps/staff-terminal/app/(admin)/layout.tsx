import RequireLogin from "../components/require-login";
import Sidebar from "./sidebar";

export default function AdminLayout({ children }: LayoutProps<"/">) {
  return (
    <RequireLogin allowed={["admin"]}>
      <div className="flex h-screen bg-surface-alt text-ink">
        <Sidebar />
        <main className="app-canvas flex-1 overflow-auto p-8">{children}</main>
      </div>
    </RequireLogin>
  );
}
