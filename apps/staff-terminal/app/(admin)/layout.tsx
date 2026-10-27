import RequireLogin from "../components/require-login";
import Sidebar from "./sidebar";

export default function AdminLayout({ children }: LayoutProps<"/">) {
  return (
    <RequireLogin allowed={["admin"]}>
      <div className="flex h-screen gap-3 p-3 text-ink">
        <Sidebar />
        <main className="flex-1 overflow-auto px-6 py-7 lg:px-10">
          <div className="animate-fade-up">{children}</div>
        </main>
      </div>
    </RequireLogin>
  );
}
