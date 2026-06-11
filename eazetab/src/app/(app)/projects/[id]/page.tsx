"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { sortExpenses, useData } from "@/lib/data-context";
import type { ExpenseWithProject } from "@/lib/types";
import { expenseCategoryLabel } from "@/lib/expense-category";
import { formatCurrency, formatDate } from "@/lib/format";
import { ProjectFormModal } from "@/components/project-form-modal";
import { SubmissionFormModal } from "@/components/submission-form-modal";
import { DeleteProjectButton } from "@/components/delete-project-button";
import { ProjectExpenseExportButton } from "@/components/project-expense-export-button";
import { StatusBadge } from "@/components/status-badge";
import { ExpenseTable } from "@/components/expense-table";
import { CategoryBadge } from "@/components/category-badge";
import { PageSkeleton } from "@/components/page-skeleton";
import { isLocalReceipt } from "@/lib/receipt-store";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { hydrated, companies, projects, submissions, expenses } = useData();

  if (!hydrated) {
    return <PageSkeleton />;
  }

  const project = projects.find((p) => p.id === id);
  const company = project
    ? companies.find((c) => c.id === project.company_id)
    : null;

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
  const projectSubmissions = submissions
    .filter((submission) => submission.project_id === project.id)
    .sort(
      (a, b) =>
        b.submitted_at.localeCompare(a.submitted_at) ||
        b.created_at.localeCompare(a.created_at)
    );

  const total = projectExpenses.reduce((sum, e) => sum + e.amount, 0);
  const receiptCount = projectExpenses.filter(
    (e) => e.receipt_url && isLocalReceipt(e.receipt_url)
  ).length;
  const categoryTotals = Array.from(
    projectExpenses.reduce((totals, expense) => {
      const category = expenseCategoryLabel(expense);
      totals.set(category, (totals.get(category) ?? 0) + expense.amount);
      return totals;
    }, new Map<string, number>())
  )
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);

  const expensesForTable: ExpenseWithProject[] = projectExpenses.map((e) => ({
    ...e,
    project: { id: project.id, project_name: project.project_name },
  }));
  const expensesBySubmission = new Map<
    string,
    { total: number; expenseCount: number; receiptCount: number }
  >();
  for (const expense of projectExpenses) {
    const entry = expensesBySubmission.get(expense.submission_id) ?? {
      total: 0,
      expenseCount: 0,
      receiptCount: 0,
    };
    entry.total += expense.amount;
    entry.expenseCount += 1;
    if (expense.receipt_url && isLocalReceipt(expense.receipt_url)) {
      entry.receiptCount += 1;
    }
    expensesBySubmission.set(expense.submission_id, entry);
  }

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
          <p className="mt-1 text-sm font-medium text-emerald-700">
            Company: {company?.company_name ?? "No company"}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <ProjectExpenseExportButton
            company={company ? { company_name: company.company_name } : null}
            project={{
              project_name: project.project_name,
              client_name: project.client_name,
            }}
            expenses={projectExpenses}
          />
          <ProjectFormModal
            project={project}
            trigger={<>Edit Project</>}
            triggerClassName="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          />
          <DeleteProjectButton
            project={project}
            expenseCount={projectExpenses.length}
            receiptCount={receiptCount}
            redirectTo="/projects"
            className="rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-50"
          />
          <Link
            href={`/expenses/new?project=${project.id}`}
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            + Add Expense
          </Link>
        </div>
      </div>

      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Submissions
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Receipt batches under this project.
            </p>
          </div>
          <SubmissionFormModal
            project={project}
            trigger={<>+ New Submission</>}
            triggerClassName="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
          />
        </div>

        {projectSubmissions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
            <p className="text-sm font-medium text-slate-600">
              No submissions yet
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Create a submission before adding receipt-backed expenses.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projectSubmissions.map((submission) => {
              const stats = expensesBySubmission.get(submission.id) ?? {
                total: 0,
                expenseCount: 0,
                receiptCount: 0,
              };

              return (
                <div
                  key={submission.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold text-slate-900">
                        {submission.submission_name}
                      </h3>
                      <p className="mt-1 text-xs font-medium text-slate-400">
                        Created {formatDate(submission.created_at)}
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                      {submission.status}
                    </span>
                  </div>

                  {submission.notes && (
                    <p className="mt-3 line-clamp-2 text-sm text-slate-500">
                      {submission.notes}
                    </p>
                  )}

                  <div className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-100 pt-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        Total
                      </p>
                      <p className="mt-1 text-sm font-bold text-slate-900">
                        {formatCurrency(stats.total)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        Expenses
                      </p>
                      <p className="mt-1 text-sm font-bold text-slate-900">
                        {stats.expenseCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        Receipts
                      </p>
                      <p className="mt-1 text-sm font-bold text-slate-900">
                        {stats.receiptCount}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
