"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useData } from "@/lib/data-context";
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  type Project,
} from "@/lib/types";
import { todayISO } from "@/lib/format";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";

export function ExpenseForm({
  projects,
  defaultProjectId,
}: {
  projects: Pick<Project, "id" | "project_name" | "client_name">[];
  defaultProjectId?: string;
}) {
  const router = useRouter();
  const { addExpense } = useData();

  const [projectId, setProjectId] = useState(
    defaultProjectId && projects.some((p) => p.id === defaultProjectId)
      ? defaultProjectId
      : ""
  );
  const [vendor, setVendor] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayISO());
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("Materials");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const parsedAmount = Number.parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }

    addExpense({
      project_id: projectId,
      vendor: vendor.trim(),
      expense_date: expenseDate,
      amount: Math.round(parsedAmount * 100) / 100,
      category,
      notes: notes.trim() || null,
      receipt_url: null,
    });

    router.push(`/projects/${projectId}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label
            htmlFor="project"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Project
          </label>
          <select
            id="project"
            required
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className={inputClass}
          >
            <option value="" disabled>
              Select a project...
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.project_name} — {p.client_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="vendor"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Vendor
          </label>
          <input
            id="vendor"
            type="text"
            required
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            placeholder="e.g. Home Depot"
            className={inputClass}
          />
        </div>

        <div>
          <label
            htmlFor="expense_date"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Expense Date
          </label>
          <input
            id="expense_date"
            type="date"
            required
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label
            htmlFor="amount"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Amount
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-slate-400">
              $
            </span>
            <input
              id="amount"
              type="number"
              required
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className={`${inputClass} pl-7`}
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="category"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Category
          </label>
          <select
            id="category"
            required
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
            className={inputClass}
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor="receipt_url"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Receipt Link{" "}
            <span className="font-normal text-slate-400">(coming soon)</span>
          </label>
          <input
            id="receipt_url"
            type="url"
            disabled
            placeholder="Google Drive receipt link — available after Drive integration"
            className={`${inputClass} cursor-not-allowed bg-slate-50 text-slate-400`}
          />
          <p className="mt-1.5 text-xs text-slate-400">
            Receipts will attach automatically once Google Drive storage is
            connected.
          </p>
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor="notes"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Notes <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            id="notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything worth remembering about this expense..."
            className={inputClass}
          />
        </div>
      </div>

      {error && (
        <p className="mt-5 rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          Add Expense
        </button>
      </div>
    </form>
  );
}
