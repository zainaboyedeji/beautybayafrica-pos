import Sidebar from "./sidebar";

export default function AdminLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex h-screen bg-zinc-100 text-zinc-900">
      <Sidebar />
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
