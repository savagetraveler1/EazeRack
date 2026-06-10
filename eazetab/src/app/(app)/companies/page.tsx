"use client";

import Link from "next/link";
import { useData } from "@/lib/data-context";
import { formatCurrency, formatDate } from "@/lib/format";
import { isLocalReceipt } from "@/lib/receipt-store";
import { CompanyFormModal } from "@/components/company-form-modal";
import { DeleteCompanyButton } from "@/components/delete-company-button";
import { PageSkeleton } from "@/components/page-skeleton";

export default function CompaniesPage() {
  const { hydrated, companies, projects, expenses } = useData();

  if (!hydrated) {
    return <PageSkeleton />;
  }

  const stats = new Map<
    string,
    { projectCount: number; expenseCount: number; receiptCount: number; total: number }
  >();

  for (const company of companies) {
    stats.set(company.id, {
      projectCount: 0,
      expenseCount: 0,
      receiptCount: 0,
      total: 0,
    });
  }

  const companyByProject = new Map(
    projects.map((project) => [project.id, project.company_id])
  );
  for (const project of projects) {
    const entry = stats.get(project.company_id);
    if (entry) {
      entry.projectCount += 1;
    }
  }
  for (const expense of expenses) {
    const companyId = companyByProject.get(expense.project_id);
    if (!companyId) continue;
    const entry = stats.get(companyId);
    if (!entry) continue;
    entry.expenseCount += 1;
    entry.total += expense.amount;
    if (expense.receipt_url && isLocalReceipt(expense.receipt_url)) {
      entry.receiptCount += 1;
    }
  }

  const sortedCompanies = [...companies].sort((a, b) =>
    a.company_name.localeCompare(b.company_name)
  );

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Companies
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Companies group related projects and their expense tabs.
          </p>
        </div>
        <CompanyFormModal
          trigger={<>+ New Company</>}
          triggerClassName="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
        />
      </div>

      {sortedCompanies.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <p className="text-sm font-medium text-slate-600">No companies yet</p>
          <p className="mt-1 text-sm text-slate-400">
            Create your first company before adding project tabs.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-5 xl:grid-cols-2">
          {sortedCompanies.map((company) => {
            const companyStats = stats.get(company.id) ?? {
              projectCount: 0,
              expenseCount: 0,
              receiptCount: 0,
              total: 0,
            };
            const companyProjects = projects
              .filter((project) => project.company_id === company.id)
              .sort((a, b) => a.project_name.localeCompare(b.project_name));

            return (
              <div
                key={company.id}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-slate-900">
                      {company.company_name}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Created {formatDate(company.created_at)}
                    </p>
                    {company.notes && (
                      <p className="mt-3 text-sm text-slate-500">
                        {company.notes}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <CompanyFormModal
                      company={company}
                      trigger={<>Edit</>}
                      triggerClassName="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                    />
                    <DeleteCompanyButton
                      company={company}
                      projectCount={companyStats.projectCount}
                      expenseCount={companyStats.expenseCount}
                      receiptCount={companyStats.receiptCount}
                    />
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-3 border-t border-slate-100 pt-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Projects
                    </p>
                    <p className="mt-1 text-lg font-bold text-slate-900">
                      {companyStats.projectCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Expenses
                    </p>
                    <p className="mt-1 text-lg font-bold text-slate-900">
                      {companyStats.expenseCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Total
                    </p>
                    <p className="mt-1 text-lg font-bold text-slate-900">
                      {formatCurrency(companyStats.total)}
                    </p>
                  </div>
                </div>

                {companyProjects.length > 0 && (
                  <div className="mt-5">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Projects
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {companyProjects.map((project) => (
                        <Link
                          key={project.id}
                          href={`/projects/${project.id}`}
                          className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-emerald-50 hover:text-emerald-700"
                        >
                          {project.project_name}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
