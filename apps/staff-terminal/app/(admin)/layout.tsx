import RequireLogin from "../components/require-login";
import Sidebar from "./sidebar";

export default function AdminLayout({ children }: LayoutProps<"/">) {
  return (
    <RequireLogin allowed={["admin"]}>
      {/* When printing a receipt, only the receipt shows. */}
      <div className="flex h-screen gap-3 p-3 text-ink print:block print:h-auto print:bg-white print:p-0">
        <div className="contents print:hidden">
          <Sidebar />
        </div>
        <main className="flex-1 overflow-auto px-6 py-7 lg:px-10 print:overflow-visible print:p-0">
          <div className="animate-fade-up print:animate-none">{children}</div>
        </main>
      </div>
    </RequireLogin>
  );
}
