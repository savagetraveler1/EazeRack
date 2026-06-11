"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useData } from "@/lib/data-context";
import {
  EXPENSE_CATEGORIES,
  PROJECT_STATUSES,
  type ExpenseCategory,
  type Project,
  type ProjectStatus,
} from "@/lib/types";
import { todayISO } from "@/lib/format";
import { saveReceipt } from "@/lib/receipt-store";
import { saveDraft } from "@/lib/draft-store";

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_RECEIPT_TYPES = ["image/", "application/pdf"];

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";
const CREATE_PROJECT_VALUE = "__create_project__";
const CREATE_COMPANY_VALUE = "__create_company__";

const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  completed: "Completed",
};

export function ExpenseForm({
  projects,
  defaultProjectId,
}: {
  projects: Pick<Project, "id" | "project_name" | "client_name">[];
  defaultProjectId?: string;
}) {
  const router = useRouter();
  const { addCompany, addExpense, addProject, companies } = useData();
  const sortedCompanies = [...companies].sort((a, b) =>
    a.company_name.localeCompare(b.company_name)
  );

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
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [newProjectCompanyId, setNewProjectCompanyId] = useState("");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyNotes, setNewCompanyNotes] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectClientName, setNewProjectClientName] = useState("");
  const [newProjectStatus, setNewProjectStatus] =
    useState<ProjectStatus>("active");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function openProjectModal() {
    setNewProjectCompanyId(sortedCompanies[0]?.id ?? CREATE_COMPANY_VALUE);
    setNewCompanyName("");
    setNewCompanyNotes("");
    setNewProjectName("");
    setNewProjectClientName("");
    setNewProjectStatus("active");
    setProjectModalOpen(true);
  }

  function handleProjectChange(value: string) {
    if (value === CREATE_PROJECT_VALUE) {
      openProjectModal();
      return;
    }
    setProjectId(value);
  }

  function handleCreateProject(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const companyId =
      newProjectCompanyId === CREATE_COMPANY_VALUE
        ? addCompany({
            company_name: newCompanyName.trim(),
            notes: newCompanyNotes.trim() || null,
          }).id
        : newProjectCompanyId;

    const project = addProject({
      company_id: companyId,
      project_name: newProjectName.trim(),
      client_name: newProjectClientName.trim(),
      status: newProjectStatus,
    });
    setProjectId(project.id);
    setProjectModalOpen(false);
  }

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
    <>
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
            onChange={(e) => handleProjectChange(e.target.value)}
            className={inputClass}
          >
            <option value="" disabled>
              Select a project...
            </option>
            <option value={CREATE_PROJECT_VALUE}>+ Create New Project</option>
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

      {projectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-slate-900/50"
            onClick={() => setProjectModalOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl sm:p-8">
            <h2 className="text-lg font-semibold text-slate-900">
              New Project
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Create a project and keep adding this expense.
            </p>

            <form onSubmit={handleCreateProject} className="mt-6 space-y-5">
              <div>
                <label
                  htmlFor="new_project_company_id"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Company
                </label>
                <select
                  id="new_project_company_id"
                  required
                  value={newProjectCompanyId}
                  onChange={(e) => setNewProjectCompanyId(e.target.value)}
                  className={inputClass}
                >
                  <option value="" disabled>
                    Select a company...
                  </option>
                  <option value={CREATE_COMPANY_VALUE}>
                    + Create New Company
                  </option>
                  {sortedCompanies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.company_name}
                    </option>
                  ))}
                </select>
              </div>

              {newProjectCompanyId === CREATE_COMPANY_VALUE && (
                <>
                  <div>
                    <label
                      htmlFor="new_company_name"
                      className="mb-1.5 block text-sm font-medium text-slate-700"
                    >
                      New Company Name
                    </label>
                    <input
                      id="new_company_name"
                      type="text"
                      required
                      value={newCompanyName}
                      onChange={(e) => setNewCompanyName(e.target.value)}
                      placeholder="e.g. BuildCo Commercial"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="new_company_notes"
                      className="mb-1.5 block text-sm font-medium text-slate-700"
                    >
                      Company Notes{" "}
                      <span className="font-normal text-slate-400">
                        (optional)
                      </span>
                    </label>
                    <textarea
                      id="new_company_notes"
                      rows={3}
                      value={newCompanyNotes}
                      onChange={(e) => setNewCompanyNotes(e.target.value)}
                      placeholder="Anything worth remembering about this company..."
                      className={inputClass}
                    />
                  </div>
                </>
              )}

              <div>
                <label
                  htmlFor="new_project_name"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Project Name
                </label>
                <input
                  id="new_project_name"
                  type="text"
                  required
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="e.g. Riverside Office Build-Out"
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="new_project_client_name"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Client Name
                </label>
                <input
                  id="new_project_client_name"
                  type="text"
                  required
                  value={newProjectClientName}
                  onChange={(e) => setNewProjectClientName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="new_project_status"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Status
                </label>
                <select
                  id="new_project_status"
                  value={newProjectStatus}
                  onChange={(e) =>
                    setNewProjectStatus(e.target.value as ProjectStatus)
                  }
                  className={inputClass}
                >
                  {PROJECT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setProjectModalOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
