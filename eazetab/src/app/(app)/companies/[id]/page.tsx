"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { sortExpenses, useData } from "@/lib/data-context";
import type { ExpenseWithProject } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import { isLocalReceipt } from "@/lib/receipt-store";
import { CompanyFormModal } from "@/components/company-form-modal";
import { DeleteCompanyButton } from "@/components/delete-company-button";
import { ExpenseTable } from "@/components/expense-table";
import { PageSkeleton } from "@/components/page-skeleton";

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { hydrated, companies, projects, expenses } = useData();

  if (!hydrated) {
    return <PageSkeleton />;
  }

  const company = companies.find((c) => c.id === id);

  if (!company) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
        <p className="text-sm font-medium text-slate-600">Company not found</p>
        <p className="mt-1 text-sm text-slate-400">
          This company may have been removed.
        </p>
        <Link
          href="/companies"
          className="mt-4 inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          Back to Companies
        </Link>
      </div>
    );
  }

  const companyProjects = projects
    .filter((project) => project.company_id === company.id)
    .sort((a, b) => a.project_name.localeCompare(b.project_name));
  const projectById = new Map(companyProjects.map((p) => [p.id, p]));
  const projectIds = new Set(companyProjects.map((p) => p.id));
  const companyExpenses = sortExpenses(
    expenses.filter((expense) => projectIds.has(expense.project_id))
  );
  const total = companyExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const receiptCount = companyExpenses.filter(
    (expense) => expense.receipt_url && isLocalReceipt(expense.receipt_url)
  ).length;
  const expensesForTable: ExpenseWithProject[] = companyExpenses.map(
    (expense) => {
      const project = projectById.get(expense.project_id);
      return {
        ...expense,
        project: project
          ? { id: project.id, project_name: project.project_name }
          : null,
      };
    }
  );

  return (
    <div>
      <Link
        href="/companies"
        className="text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        ← Back to Companies
      </Link>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {company.company_name}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            {company.notes || "No company notes yet."}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <CompanyFormModal
            company={company}
            trigger={<>Edit Company</>}
            triggerClassName="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          />
          <DeleteCompanyButton
            company={company}
            projectCount={companyProjects.length}
            expenseCount={companyExpenses.length}
            receiptCount={receiptCount}
            redirectTo="/companies"
            className="rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-50"
          />
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-900 p-6 shadow-sm">
          <p className="text-sm font-medium text-slate-400">Total Tab Amount</p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-white">
            {formatCurrency(total)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Projects</p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
            {companyProjects.length}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Expenses</p>
          <p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
            {companyExpenses.length}
          </p>
        </div>
      </div>

      <div className="mt-10">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          Projects
        </h2>
        {companyProjects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
            <p className="text-sm font-medium text-slate-600">
              No projects yet
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Add a project from the Projects page or while entering an expense.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {companyProjects.map((project) => {
              const projectExpenses = companyExpenses.filter(
                (expense) => expense.project_id === project.id
              );
              const projectTotal = projectExpenses.reduce(
                (sum, expense) => sum + expense.amount,
                0
              );

              return (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
                >
                  <p className="truncate text-base font-semibold text-slate-900">
                    {project.project_name}
                  </p>
                  <p className="mt-1 truncate text-sm text-slate-500">
                    {project.client_name}
                  </p>
                  <div className="mt-4 flex items-end justify-between border-t border-slate-100 pt-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        Total
                      </p>
                      <p className="mt-1 text-lg font-bold text-slate-900">
                        {formatCurrency(projectTotal)}
                      </p>
                    </div>
                    <p className="text-xs font-medium text-slate-400">
                      {projectExpenses.length} expense
                      {projectExpenses.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-10">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          Expense History
        </h2>
        <ExpenseTable expenses={expensesForTable} />
      </div>
    </div>
  );
}
