"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useData } from "@/lib/data-context";
import type { Project } from "@/lib/types";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function DeleteProjectButton({
  project,
  expenseCount,
  receiptCount,
  redirectTo,
  className = "rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50",
}: {
  project: Project;
  expenseCount: number;
  receiptCount: number;
  /** Navigate here after a successful delete (e.g. when on the project detail page). */
  redirectTo?: string;
  className?: string;
}) {
  const { deleteProject } = useData();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      await deleteProject(project.id);
      setOpen(false);
      if (redirectTo) {
        router.push(redirectTo);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        Delete
      </button>

      <ConfirmDialog
        open={open}
        title="Delete project?"
        description={
          <>
            <p>
              This will permanently delete{" "}
              <strong>{project.project_name}</strong> and all{" "}
              <strong>
                {expenseCount} expense{expenseCount === 1 ? "" : "s"}
              </strong>{" "}
              attached to it.
            </p>
            {receiptCount > 0 && (
              <p className="mt-2">
                {receiptCount} local receipt file
                {receiptCount === 1 ? "" : "s"} will also be removed from this
                browser.
              </p>
            )}
            <p className="mt-2 text-slate-500">This action cannot be undone.</p>
          </>
        }
        onConfirm={handleConfirm}
        onCancel={() => setOpen(false)}
        loading={loading}
      />
    </>
  );
}
