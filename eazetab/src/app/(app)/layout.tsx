import { Sidebar } from "@/components/sidebar";
import { DataProvider } from "@/lib/data-context";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <DataProvider>
      <div className="min-h-screen bg-slate-50">
        <Sidebar />
        <main className="px-4 py-6 sm:px-6 lg:ml-64 lg:px-10 lg:py-10">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </DataProvider>
  );
}
