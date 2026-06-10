"use client";

import Link from "next/link";
import { sortExpenses, useData } from "@/lib/data-context";
import type { ExpenseWithProject } from "@/lib/types";
import { formatCurrency, startOfCurrentMonth } from "@/lib/format";
import { StatCard } from "@/components/stat-card";
import { ExpenseTable } from "@/components/expense-table";
import { PageSkeleton } from "@/components/page-skeleton";

export default function DashboardPage() {
  const { hydrated, companies, projects, expenses } = useData();

  if (!hydrated) {
    return <PageSkeleton />;
  }

  const monthStart = startOfCurrentMonth();
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const monthTotal = expenses
    .filter((e) => e.expense_date >= monthStart)
    .reduce((sum, e) => sum + e.amount, 0);
  const monthLabel = new Date().toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const projectById = new Map(projects.map((p) => [p.id, p]));
  const recentExpenses: ExpenseWithProject[] = sortExpenses(expenses)
    .slice(0, 8)
    .map((e) => {
      const project = projectById.get(e.project_id);
      return {
        ...e,
        project: project
          ? { id: project.id, project_name: project.project_name }
          : null,
      };
    });

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            An overview of every project tab.
          </p>
        </div>
        <Link
          href="/expenses/new"
          className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          + Add Expense
        </Link>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Companies"
          value={String(companies.length)}
          hint="All companies"
          accent="blue"
        />
        <StatCard
          label="Total Projects"
          value={String(projects.length)}
          hint="All projects"
          accent="emerald"
        />
        <StatCard
          label="Total Expenses"
          value={formatCurrency(totalExpenses)}
          hint="All time, across all projects"
          accent="amber"
        />
        <StatCard
          label="Expenses This Month"
          value={formatCurrency(monthTotal)}
          hint={monthLabel}
          accent="blue"
        />
      </div>

      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            Recent Expenses
          </h2>
          <Link
            href="/projects"
            className="text-sm font-medium text-emerald-700 hover:underline"
          >
            View projects →
          </Link>
        </div>
        <ExpenseTable expenses={recentExpenses} />
      </div>
    </div>
  );
}
