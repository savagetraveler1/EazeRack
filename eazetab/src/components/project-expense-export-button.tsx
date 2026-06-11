"use client";

import type { Company, Expense, Project } from "@/lib/types";
import {
  buildProjectExpensesCsv,
  projectExpensesCsvFileName,
} from "@/lib/project-expense-export";

export function ProjectExpenseExportButton({
  company,
  project,
  expenses,
}: {
  company: Pick<Company, "company_name"> | null;
  project: Pick<Project, "project_name" | "client_name">;
  expenses: Expense[];
}) {
  function handleExport() {
    const csv = buildProjectExpensesCsv({ company, project, expenses });
    const filename = projectExpensesCsvFileName({
      companyName: company?.company_name ?? null,
      projectName: project.project_name,
    });
    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
    >
      Export CSV
    </button>
  );
}
