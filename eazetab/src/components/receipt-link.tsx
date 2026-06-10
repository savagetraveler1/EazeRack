"use client";

import { useState } from "react";
import { getReceipt, isLocalReceipt } from "@/lib/receipt-store";

/**
 * Renders a "View Receipt" link for an expense.
 * Local receipts (`local:<id>`) are loaded from IndexedDB and opened in a new
 * tab via an object URL; anything else (future Google Drive links) is a plain
 * external link.
 */
export function ReceiptLink({ receiptUrl }: { receiptUrl: string | null }) {
  const [opening, setOpening] = useState(false);
  const [missing, setMissing] = useState(false);

  if (!receiptUrl) {
    return (
      <span className="text-xs text-slate-300" title="No receipt attached">
        —
      </span>
    );
  }

  if (!isLocalReceipt(receiptUrl)) {
    return (
      <a
        href={receiptUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-medium text-emerald-700 hover:underline"
      >
        View Receipt
      </a>
    );
  }

  if (missing) {
    return (
      <span
        className="text-xs text-slate-400"
        title="Receipt file not found in this browser's local storage"
      >
        Missing
      </span>
    );
  }

  async function handleOpen() {
    setOpening(true);
    try {
      const receipt = await getReceipt(receiptUrl!);
      if (!receipt) {
        setMissing(true);
        return;
      }
      const url = URL.createObjectURL(receipt.blob);
      window.open(url, "_blank", "noopener");
      // Give the new tab time to load the blob before revoking.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setMissing(true);
    } finally {
      setOpening(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleOpen}
      disabled={opening}
      className="text-sm font-medium text-emerald-700 hover:underline disabled:opacity-60"
    >
      {opening ? "Opening..." : "View Receipt"}
    </button>
  );
}
