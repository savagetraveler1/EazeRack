"use client";

import { Suspense } from "react";
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
        <ExpenseForm
          projects={sortedProjects}
          defaultProjectId={defaultProjectId}
        />
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
