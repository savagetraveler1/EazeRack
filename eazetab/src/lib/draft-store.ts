import type { ExpenseInput } from "@/lib/types";

/**
 * Pending expense draft for the receipt review step.
 *
 * When an expense is added WITH a receipt, the receipt file is saved to
 * IndexedDB right away and the form values are parked here (sessionStorage)
 * while the user reviews them on /receipts/review. Approving the draft turns
 * it into a real expense; discarding it deletes the stored receipt.
 */

const DRAFT_KEY = "eazetab-expense-draft";

export type ExpenseDraft = ExpenseInput & {
  receipt_name: string | null;
  receipt_type: string | null;
};

export function saveDraft(draft: ExpenseDraft): void {
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function loadDraft(): ExpenseDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as ExpenseDraft) : null;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  sessionStorage.removeItem(DRAFT_KEY);
}
