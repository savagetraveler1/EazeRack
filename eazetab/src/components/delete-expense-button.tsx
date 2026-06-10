"use client";

import { useState } from "react";
import { useData } from "@/lib/data-context";
import { formatCurrency, formatDate } from "@/lib/format";
import { isLocalReceipt } from "@/lib/receipt-store";
import type { ExpenseWithProject } from "@/lib/types";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function DeleteExpenseButton({
  expense,
  className = "rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50",
}: {
  expense: ExpenseWithProject;
  className?: string;
}) {
  const { deleteExpense } = useData();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      await deleteExpense(expense.id);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  const hasReceipt = Boolean(
    expense.receipt_url && isLocalReceipt(expense.receipt_url)
  );

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        Delete
      </button>

      <ConfirmDialog
        open={open}
        title="Delete expense?"
        description={
          <>
            <p>
              This will permanently delete the expense for{" "}
              <strong>{expense.vendor}</strong> (
              {formatCurrency(expense.amount)} on{" "}
              {formatDate(expense.expense_date)}
              {expense.project
                ? ` on ${expense.project.project_name}`
                : null}
              ).
            </p>
            {hasReceipt && (
              <p className="mt-2">
                The attached receipt file will also be removed from this
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
