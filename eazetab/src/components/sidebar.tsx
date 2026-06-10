"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
  {
    href: "/companies",
    label: "Companies",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3.75h8.25v17.5H4.5V3.75zM12.75 8.25h6.75v13h-6.75v-13zM7.5 7.5h2.25M7.5 11.25h2.25M7.5 15h2.25M15.75 12h1.5M15.75 15.75h1.5" />
      </svg>
    ),
  },
  {
    href: "/projects",
    label: "Projects",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
      </svg>
    ),
  },
  {
    href: "/expenses/new",
    label: "Add Expense",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    href: "/receipts/review",
    label: "Review Receipts",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              active
                ? "bg-emerald-600 text-white"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="border-t border-slate-800 px-6 py-4">
      <p className="text-xs font-medium text-slate-400">Local MVP</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        Data is stored in this browser. Google Drive &amp; Sheets sync coming
        soon.
      </p>
    </div>
  );

  const brand = (
    <div className="flex items-center gap-3 px-6 py-6">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-lg font-bold text-white">
        E
      </div>
      <span className="text-lg font-bold tracking-tight text-white">
        EazeTab
      </span>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-base font-bold text-white">
            E
          </div>
          <span className="text-base font-bold text-white">EazeTab</span>
        </div>
        <button
          onClick={() => setMobileOpen((o) => !o)}
          aria-label="Toggle navigation"
          className="rounded-lg p-2 text-slate-300 hover:bg-slate-800"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
            {mobileOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            )}
          </svg>
        </button>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-30 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/60"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-[57px] bottom-0 flex w-64 flex-col bg-slate-900 pt-4">
            {nav}
            {footer}
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-slate-900 lg:flex">
        {brand}
        {nav}
        {footer}
      </aside>
    </>
  );
}
