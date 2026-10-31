import RequireLogin from "../components/require-login";
import Sidebar from "./sidebar";

export default function AdminLayout({ children }: LayoutProps<"/">) {
  return (
    <RequireLogin allowed={["admin"]}>
      {/* When printing a receipt, only the receipt shows. */}
      <div className="flex h-screen flex-col gap-3 p-3 text-ink lg:flex-row print:block print:h-auto print:bg-white print:p-0">
        <div className="contents print:hidden">
          <Sidebar />
        </div>
        <main className="flex-1 overflow-auto px-1 py-4 sm:px-6 sm:py-7 lg:px-10 print:overflow-visible print:p-0">
          <div className="animate-fade-up print:animate-none">{children}</div>
        </main>
      </div>
    </RequireLogin>
  );
}
