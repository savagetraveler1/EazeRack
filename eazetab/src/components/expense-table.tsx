import Link from "next/link";
import type { ExpenseWithProject } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/format";
import { CategoryBadge } from "@/components/category-badge";
import { ReceiptLink } from "@/components/receipt-link";

export function ExpenseTable({
  expenses,
  showProject = true,
}: {
  expenses: ExpenseWithProject[];
  showProject?: boolean;
}) {
  if (expenses.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
        <p className="text-sm font-medium text-slate-600">No expenses yet</p>
        <p className="mt-1 text-sm text-slate-400">
          Add your first expense to start the tab.
        </p>
        <Link
          href="/expenses/new"
          className="mt-4 inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          Add Expense
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">Vendor</th>
              {showProject && <th className="px-5 py-3 font-medium">Project</th>}
              <th className="px-5 py-3 font-medium">Category</th>
              <th className="px-5 py-3 font-medium">Notes</th>
              <th className="px-5 py-3 font-medium">Receipt</th>
              <th className="px-5 py-3 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {expenses.map((expense) => (
              <tr key={expense.id} className="transition hover:bg-slate-50">
                <td className="whitespace-nowrap px-5 py-3.5 text-slate-600">
                  {formatDate(expense.expense_date)}
                </td>
                <td className="px-5 py-3.5 font-medium text-slate-900">
                  {expense.vendor}
                </td>
                {showProject && (
                  <td className="px-5 py-3.5">
                    {expense.project ? (
                      <Link
                        href={`/projects/${expense.project.id}`}
                        className="text-emerald-700 hover:underline"
                      >
                        {expense.project.project_name}
                      </Link>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                )}
                <td className="px-5 py-3.5">
                  <CategoryBadge category={expense.category} />
                </td>
                <td className="max-w-[220px] truncate px-5 py-3.5 text-slate-500">
                  {expense.notes || <span className="text-slate-300">—</span>}
                </td>
                <td className="whitespace-nowrap px-5 py-3.5">
                  <ReceiptLink receiptUrl={expense.receipt_url} />
                </td>
                <td className="whitespace-nowrap px-5 py-3.5 text-right font-semibold text-slate-900">
                  {formatCurrency(expense.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
