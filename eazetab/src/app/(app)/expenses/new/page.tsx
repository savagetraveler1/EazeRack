"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useData } from "@/lib/data-context";
import { ExpenseForm } from "@/components/expense-form";
import { PageSkeleton } from "@/components/page-skeleton";

function NewExpenseContent() {
  const searchParams = useSearchParams();
  const defaultProjectId = searchParams.get("project") ?? undefined;
  const { hydrated, projects } = useData();

  if (!hydrated) {
    return <PageSkeleton />;
  }

  const sortedProjects = [...projects].sort((a, b) =>
    a.project_name.localeCompare(b.project_name)
  );

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        Add Expense
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Put a new expense on a project&apos;s tab.
      </p>

      <div className="mt-8">
        {sortedProjects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-600">
              You need a project first
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Expenses live on a project&apos;s tab. Create a project to get
              started.
            </p>
            <Link
              href="/projects"
              className="mt-4 inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Go to Projects
            </Link>
          </div>
        ) : (
          <ExpenseForm
            projects={sortedProjects}
            defaultProjectId={defaultProjectId}
          />
        )}
      </div>
    </div>
  );
}

export default function NewExpensePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewExpenseContent />
    </Suspense>
  );
}
