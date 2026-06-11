"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useData } from "@/lib/data-context";
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
} from "@/lib/types";
import { todayISO } from "@/lib/format";
import {
  clearDraft,
  loadDraft,
  saveDraft,
  type ExpenseDraft,
} from "@/lib/draft-store";
import { deleteReceipt, getReceipt, saveReceipt } from "@/lib/receipt-store";
import { scanReceiptImage, type OcrSuggestions } from "@/lib/ocr";
import { ReceiptPreview } from "@/components/receipt-preview";
import { OcrBadge } from "@/components/ocr-badge";
import { PageSkeleton } from "@/components/page-skeleton";

type OcrField = "vendor" | "expense_date" | "amount" | "category";
type OcrStatus =
  | "idle"
  | "scanning"
  | "ready"
  | "empty"
  | "unavailable"
  | "error";

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_RECEIPT_TYPES = ["image/", "application/pdf"];

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";

export default function ReviewReceiptsPage() {
  const router = useRouter();
  const { hydrated, projects, addExpense } = useData();

  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);
  const [amountText, setAmountText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<OcrStatus>("idle");
  const [ocrSuggestions, setOcrSuggestions] = useState<OcrSuggestions | null>(
    null
  );
  const [ocrApplied, setOcrApplied] = useState<Set<OcrField>>(new Set());
  const replaceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = loadDraft();
    setDraft(stored);
    setAmountText(stored?.amount ? String(stored.amount) : "");
    setDraftLoaded(true);
  }, []);

  useEffect(() => {
    if (!draft?.receipt_url) {
      setOcrStatus("idle");
      setOcrSuggestions(null);
      setOcrApplied(new Set());
      return;
    }

    if (draft.receipt_type === "application/pdf") {
      setOcrStatus("unavailable");
      setOcrSuggestions(null);
      setOcrApplied(new Set());
      return;
    }

    if (!draft.receipt_type?.startsWith("image/")) {
      setOcrStatus("idle");
      return;
    }

    let cancelled = false;
    setOcrStatus("scanning");
    setOcrSuggestions(null);
    setOcrApplied(new Set());

    (async () => {
      try {
        const receipt = await getReceipt(draft.receipt_url!);
        if (cancelled) return;
        if (!receipt) {
          setOcrStatus("error");
          return;
        }

        const { suggestions } = await scanReceiptImage(receipt.blob);
        if (cancelled) return;

        const patch: Partial<ExpenseDraft> = {};
        const applied = new Set<OcrField>();

        if (suggestions.vendor) {
          patch.vendor = suggestions.vendor;
          applied.add("vendor");
        }
        if (suggestions.expense_date) {
          patch.expense_date = suggestions.expense_date;
          applied.add("expense_date");
        }
        if (suggestions.amount !== null) {
          patch.amount = suggestions.amount;
          setAmountText(String(suggestions.amount));
          applied.add("amount");
        }
        if (suggestions.category) {
          patch.category = suggestions.category;
          patch.custom_category = null;
          applied.add("category");
        }

        if (applied.size > 0) {
          updateDraft(patch);
        }
        setOcrSuggestions(suggestions);
        setOcrApplied(applied);
        setOcrStatus(applied.size > 0 ? "ready" : "empty");
      } catch {
        if (!cancelled) setOcrStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [draft?.receipt_url, draft?.receipt_type]);

  function updateDraft(patch: Partial<ExpenseDraft>) {
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d, ...patch };
      saveDraft(next);
      return next;
    });
  }

  function clearOcrField(field: OcrField) {
    setOcrApplied((prev) => {
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  }

  async function handleReplaceFile(e: ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    if (!file || !draft) return;

    if (!ACCEPTED_RECEIPT_TYPES.some((t) => file.type.startsWith(t))) {
      setError("Receipts must be an image or a PDF.");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      setError("Receipt files must be 10 MB or smaller.");
      e.target.value = "";
      return;
    }

    setBusy(true);
    try {
      const newUrl = await saveReceipt(file);
      if (draft.receipt_url) {
        await deleteReceipt(draft.receipt_url);
      }
      updateDraft({
        receipt_url: newUrl,
        receipt_name: file.name,
        receipt_type: file.type,
        vendor: "",
        expense_date: todayISO(),
        amount: 0,
        category: "Materials",
        custom_category: null,
      });
      setAmountText("");
      setOcrApplied(new Set());
    } catch {
      setError("Could not save the new receipt file.");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function handleDiscard() {
    if (draft?.receipt_url) {
      setBusy(true);
      try {
        await deleteReceipt(draft.receipt_url);
      } catch {
        // Best effort cleanup.
      }
    }
    clearDraft();
    router.push("/expenses/new");
  }

  function handleApprove(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!draft) return;
    setError(null);

    const parsedAmount = Number.parseFloat(amountText);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (!draft.project_id) {
      setError("Select a project.");
      return;
    }
    if (!draft.vendor.trim()) {
      setError("Enter a vendor.");
      return;
    }
    if (draft.category === "Other" && !draft.custom_category?.trim()) {
      setError("Enter a custom category.");
      return;
    }

    addExpense({
      project_id: draft.project_id,
      vendor: draft.vendor.trim(),
      expense_date: draft.expense_date,
      amount: Math.round(parsedAmount * 100) / 100,
      category: draft.category,
      custom_category:
        draft.category === "Other"
          ? (draft.custom_category?.trim() ?? null)
          : null,
      notes: draft.notes?.trim() || null,
      receipt_url: draft.receipt_url,
    });

    clearDraft();
    router.push(`/projects/${draft.project_id}`);
  }

  if (!hydrated || !draftLoaded) {
    return <PageSkeleton />;
  }

  // No pending draft: show the placeholder / explainer state.
  if (!draft) {
    return <EmptyReviewState />;
  }

  const selectedProject = projects.find(
    (project) => project.id === draft.project_id
  );

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        Review Scanned Receipt
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        OCR filled what it could. Verify or correct the fields, then save the
        expense.
      </p>

      <OcrStatusBanner
        status={ocrStatus}
        suggestions={ocrSuggestions}
        applied={ocrApplied}
      />

      <form
        onSubmit={handleApprove}
        className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2"
      >
        {/* Receipt side */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900">Receipt</h2>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => replaceInputRef.current?.click()}
                disabled={busy}
                className="text-xs font-medium text-emerald-700 hover:underline disabled:opacity-60"
              >
                Replace
              </button>
            </div>
          </div>
          <input
            ref={replaceInputRef}
            type="file"
            accept="image/*,application/pdf"
            onChange={handleReplaceFile}
            className="hidden"
          />

          {draft.receipt_url ? (
            <>
              <ReceiptPreview
                key={draft.receipt_url}
                receiptUrl={draft.receipt_url}
                fileName={draft.receipt_name}
              />
              {draft.receipt_name && (
                <p className="mt-3 truncate text-xs text-slate-400">
                  {draft.receipt_name}
                </p>
              )}
            </>
          ) : (
            <div className="flex h-72 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center">
              <p className="text-sm font-medium text-slate-500">
                No receipt attached
              </p>
              <p className="mt-1 max-w-xs text-xs text-slate-400">
                You removed the receipt. The expense will save without one, or
                you can attach a replacement.
              </p>
            </div>
          )}
        </div>

        {/* Details side */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">
            Verify Expense Details
          </h2>
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Project
              </p>
              <p className="mt-1 font-medium text-slate-800">
                {selectedProject
                  ? `${selectedProject.project_name} — ${selectedProject.client_name}`
                  : "Selected project"}
              </p>
            </div>

            <div>
              <label
                htmlFor="vendor"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Vendor
                {ocrApplied.has("vendor") && <OcrBadge />}
              </label>
              <input
                id="vendor"
                type="text"
                required
                value={draft.vendor}
                onChange={(e) => {
                  clearOcrField("vendor");
                  updateDraft({ vendor: e.target.value });
                }}
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="expense_date"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Expense Date
                  {ocrApplied.has("expense_date") && <OcrBadge />}
                </label>
                <input
                  id="expense_date"
                  type="date"
                  required
                  value={draft.expense_date}
                  onChange={(e) => {
                    clearOcrField("expense_date");
                    updateDraft({ expense_date: e.target.value });
                  }}
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="amount"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Amount
                  {ocrApplied.has("amount") && <OcrBadge />}
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
                    value={amountText}
                    onChange={(e) => {
                      clearOcrField("amount");
                      setAmountText(e.target.value);
                      const parsed = Number.parseFloat(e.target.value);
                      if (Number.isFinite(parsed)) {
                        updateDraft({ amount: parsed });
                      }
                    }}
                    className={`${inputClass} pl-7`}
                  />
                </div>
              </div>
            </div>

            <div>
              <label
                htmlFor="category"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Category
                {ocrApplied.has("category") && <OcrBadge />}
              </label>
              <select
                id="category"
                required
                value={draft.category}
                onChange={(e) => {
                  const nextCategory = e.target.value as ExpenseCategory;
                  clearOcrField("category");
                  updateDraft({
                    category: nextCategory,
                    custom_category:
                      nextCategory === "Other"
                        ? (draft.custom_category ?? "")
                        : null,
                  });
                }}
                className={inputClass}
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {draft.category === "Other" && (
              <div>
                <label
                  htmlFor="custom_category"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Custom Category
                </label>
                <input
                  id="custom_category"
                  type="text"
                  required
                  value={draft.custom_category ?? ""}
                  onChange={(e) =>
                    updateDraft({ custom_category: e.target.value })
                  }
                  className={inputClass}
                />
              </div>
            )}

            <div>
              <label
                htmlFor="notes"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Notes{" "}
                <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <textarea
                id="notes"
                rows={3}
                value={draft.notes ?? ""}
                onChange={(e) =>
                  updateDraft({ notes: e.target.value || null })
                }
                className={inputClass}
              />
            </div>
          </div>

          {error && (
            <p className="mt-4 rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={handleDiscard}
              disabled={busy}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              Discard
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save Expense
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function OcrStatusBanner({
  status,
  suggestions,
  applied,
}: {
  status: OcrStatus;
  suggestions: OcrSuggestions | null;
  applied: Set<OcrField>;
}) {
  if (status === "idle") return null;

  if (status === "scanning") {
    return (
      <div className="mt-6 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
        Reading receipt with OCR...
      </div>
    );
  }

  if (status === "unavailable") {
    return (
      <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        OCR runs on image receipts right now. This receipt is attached, so enter
        the visible vendor, date, total amount, and category manually.
      </div>
    );
  }

  if (status === "error" || status === "empty") {
    return (
      <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        OCR could not read this receipt clearly. Enter or correct the values
        below before saving.
      </div>
    );
  }

  const filled = Array.from(applied).map(fieldLabel).join(", ");

  return (
    <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
      <p className="font-medium">OCR populated {filled || "receipt fields"}.</p>
      <p className="mt-1 text-xs text-emerald-700">
        Please verify the values. OCR can misread receipts.
      </p>
      {suggestions?.amount !== null && suggestions?.amount !== undefined && (
        <p className="mt-1 text-xs text-emerald-700">
          Detected total: ${suggestions.amount.toFixed(2)}
        </p>
      )}
    </div>
  );
}

function fieldLabel(field: OcrField): string {
  switch (field) {
    case "expense_date":
      return "date";
    case "amount":
      return "amount";
    case "category":
      return "category";
    case "vendor":
      return "vendor";
  }
}

const PIPELINE_STEPS = [
  {
    title: "Choose company and project",
    description:
      "Start by choosing where the expense belongs.",
  },
  {
    title: "Attach a receipt",
    description:
      "Image receipts are scanned locally for vendor, date, total amount, and category.",
  },
  {
    title: "Review and save",
    description:
      "Verify the OCR-filled values, correct anything off, and save the expense.",
  },
  {
    title: "Synced to Google Sheets (coming soon)",
    description:
      "Every approved expense will be written to your project's expense sheet.",
  },
];

function EmptyReviewState() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        Review Receipts
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Expenses with an attached receipt stop here for review before they hit
        a project&apos;s tab.
      </p>

      <div className="mt-8 rounded-2xl border-2 border-dashed border-slate-300 bg-white px-6 py-16 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-7 w-7">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h2 className="mt-4 text-base font-semibold text-slate-900">
          Nothing waiting for review
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
          Add an expense with a receipt attached and it will appear here so you
          can confirm the details before saving.
        </p>
        <Link
          href="/expenses/new"
          className="mt-5 inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          Add Expense
        </Link>
      </div>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-base font-semibold text-slate-900">
          How the receipt pipeline works
        </h2>
        <ol className="mt-5 space-y-5">
          {PIPELINE_STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-medium text-slate-900">
                  {step.title}
                </p>
                <p className="mt-0.5 text-sm text-slate-500">
                  {step.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
