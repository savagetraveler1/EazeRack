"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { sortExpenses, useData } from "@/lib/data-context";
import { EXPENSE_CATEGORIES, type ExpenseWithProject } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import { ProjectFormModal } from "@/components/project-form-modal";
import { StatusBadge } from "@/components/status-badge";
import { ExpenseTable } from "@/components/expense-table";
import { CategoryBadge } from "@/components/category-badge";
import { PageSkeleton } from "@/components/page-skeleton";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { hydrated, projects, expenses } = useData();

  if (!hydrated) {
    return <PageSkeleton />;
  }

  const project = projects.find((p) => p.id === id);

  if (!project) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
        <p className="text-sm font-medium text-slate-600">Project not found</p>
        <p className="mt-1 text-sm text-slate-400">
          This project may have been removed.
        </p>
        <Link
          href="/projects"
          className="mt-4 inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          Back to Projects
        </Link>
      </div>
    );
  }

  const projectExpenses = sortExpenses(
    expenses.filter((e) => e.project_id === project.id)
  );

  const total = projectExpenses.reduce((sum, e) => sum + e.amount, 0);
  const categoryTotals = EXPENSE_CATEGORIES.map((category) => ({
    category,
    total: projectExpenses
      .filter((e) => e.category === category)
      .reduce((sum, e) => sum + e.amount, 0),
  })).filter((c) => c.total > 0);

  const expensesForTable: ExpenseWithProject[] = projectExpenses.map((e) => ({
    ...e,
    project: { id: project.id, project_name: project.project_name },
  }));

  return (
    <div>
      <Link
        href="/projects"
        className="text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        ← Back to Projects
      </Link>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {project.project_name}
            </h1>
            <StatusBadge status={project.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Client: {project.client_name}
          </p>
        </div>
        <div className="flex gap-3">
          <ProjectFormModal
            project={project}
            trigger={<>Edit Project</>}
            triggerClassName="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          />
          <Link
            href={`/expenses/new?project=${project.id}`}
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            + Add Expense
          </Link>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-900 p-6 shadow-sm">
          <p className="text-sm font-medium text-slate-400">
            Total Project Expenses
          </p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-white">
            {formatCurrency(total)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500">
            {projectExpenses.length} expense
            {projectExpenses.length === 1 ? "" : "s"} on this tab
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <p className="text-sm font-medium text-slate-500">Category Totals</p>
          {categoryTotals.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">
              No expenses recorded yet.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {categoryTotals.map(({ category, total: catTotal }) => (
                <li key={category} className="flex items-center gap-3">
                  <div className="w-28 shrink-0">
                    <CategoryBadge category={category} />
                  </div>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{
                        width: `${total > 0 ? Math.max((catTotal / total) * 100, 2) : 0}%`,
                      }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right text-sm font-semibold text-slate-900">
                    {formatCurrency(catTotal)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-10">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          Expense History
        </h2>
        <ExpenseTable expenses={expensesForTable} showProject={false} />
      </div>
    </div>
  );
}
