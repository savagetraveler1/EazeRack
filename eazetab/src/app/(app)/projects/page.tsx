"use client";

import Link from "next/link";
import { useData } from "@/lib/data-context";
import { formatCurrency } from "@/lib/format";
import { ProjectFormModal } from "@/components/project-form-modal";
import { StatusBadge } from "@/components/status-badge";
import { PageSkeleton } from "@/components/page-skeleton";

export default function ProjectsPage() {
  const { hydrated, projects, expenses } = useData();

  if (!hydrated) {
    return <PageSkeleton />;
  }

  const totals = new Map<string, { total: number; count: number }>();
  for (const expense of expenses) {
    const entry = totals.get(expense.project_id) ?? { total: 0, count: 0 };
    entry.total += expense.amount;
    entry.count += 1;
    totals.set(expense.project_id, entry);
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Projects
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Every project keeps its own running tab.
          </p>
        </div>
        <ProjectFormModal
          trigger={<>+ New Project</>}
          triggerClassName="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
        />
      </div>

      {projects.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <p className="text-sm font-medium text-slate-600">No projects yet</p>
          <p className="mt-1 text-sm text-slate-400">
            Create your first project to start tracking expenses.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const stats = totals.get(project.id) ?? { total: 0, count: 0 };
            return (
              <div
                key={project.id}
                className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/projects/${project.id}`}
                      className="block truncate text-base font-semibold text-slate-900 hover:text-emerald-700"
                    >
                      {project.project_name}
                    </Link>
                    <p className="mt-0.5 truncate text-sm text-slate-500">
                      {project.client_name}
                    </p>
                  </div>
                  <StatusBadge status={project.status} />
                </div>

                <div className="mt-5 flex items-end justify-between border-t border-slate-100 pt-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Tab Total
                    </p>
                    <p className="mt-1 text-xl font-bold text-slate-900">
                      {formatCurrency(stats.total)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {stats.count} expense{stats.count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <ProjectFormModal
                      project={project}
                      trigger={<>Edit</>}
                      triggerClassName="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                    />
                    <Link
                      href={`/projects/${project.id}`}
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-700"
                    >
                      View Tab
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
