"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useData } from "@/lib/data-context";
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  type Project,
} from "@/lib/types";
import { todayISO } from "@/lib/format";
import { saveReceipt } from "@/lib/receipt-store";
import { saveDraft } from "@/lib/draft-store";

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_RECEIPT_TYPES = ["image/", "application/pdf"];

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
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setReceiptFile(null);
      return;
    }
    if (!ACCEPTED_RECEIPT_TYPES.some((t) => file.type.startsWith(t))) {
      setError("Receipts must be an image or a PDF.");
      e.target.value = "";
      setReceiptFile(null);
      return;
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      setError("Receipt files must be 10 MB or smaller.");
      e.target.value = "";
      setReceiptFile(null);
      return;
    }
    setReceiptFile(file);
  }

  function clearReceipt() {
    setReceiptFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const parsedAmount = Number.parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }

    setSaving(true);
    const values = {
      project_id: projectId,
      vendor: vendor.trim(),
      expense_date: expenseDate,
      amount: Math.round(parsedAmount * 100) / 100,
      category,
      notes: notes.trim() || null,
    };

    if (receiptFile) {
      // With a receipt attached, park the expense as a draft and send the
      // user to the review step instead of saving immediately.
      let receiptUrl: string;
      try {
        receiptUrl = await saveReceipt(receiptFile);
      } catch {
        setError("Could not save the receipt file. Try again or remove it.");
        setSaving(false);
        return;
      }
      saveDraft({
        ...values,
        receipt_url: receiptUrl,
        receipt_name: receiptFile.name,
        receipt_type: receiptFile.type,
      });
      router.push("/receipts/review");
      return;
    }

    addExpense({ ...values, receipt_url: null });
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
            htmlFor="receipt"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Receipt{" "}
            <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            ref={fileInputRef}
            id="receipt"
            type="file"
            accept="image/*,application/pdf"
            onChange={handleFileChange}
            className="block w-full cursor-pointer rounded-lg border border-slate-300 text-sm text-slate-500 file:mr-4 file:cursor-pointer file:rounded-l-lg file:border-0 file:bg-slate-100 file:px-4 file:py-2.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
          {receiptFile && (
            <div className="mt-2 flex items-center justify-between rounded-lg bg-emerald-50 px-3.5 py-2 text-sm">
              <span className="truncate text-emerald-800">
                {receiptFile.name}{" "}
                <span className="text-emerald-600">
                  ({(receiptFile.size / 1024).toFixed(0)} KB)
                </span>
              </span>
              <button
                type="button"
                onClick={clearReceipt}
                className="ml-3 shrink-0 text-xs font-medium text-emerald-700 hover:underline"
              >
                Remove
              </button>
            </div>
          )}
          <p className="mt-1.5 text-xs text-slate-400">
            Image or PDF, up to 10 MB. With a receipt attached, you&apos;ll
            review everything before the expense is saved. Stored locally in
            this browser for the MVP — Google Drive storage comes later.
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
          disabled={saving}
          className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving
            ? "Saving..."
            : receiptFile
              ? "Review Receipt"
              : "Add Expense"}
        </button>
      </div>
    </form>
  );
}
