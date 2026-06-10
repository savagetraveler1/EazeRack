"use client";

import { useEffect, useState } from "react";
import { getReceipt } from "@/lib/receipt-store";

/**
 * Renders an inline preview of a locally stored receipt:
 * images render directly, PDFs embed in an iframe with an open-in-tab link.
 */
export function ReceiptPreview({
  receiptUrl,
  fileName,
}: {
  receiptUrl: string;
  fileName: string | null;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [fileType, setFileType] = useState<string>("");
  const [status, setStatus] = useState<"loading" | "ready" | "missing">(
    "loading"
  );

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;

    (async () => {
      try {
        const receipt = await getReceipt(receiptUrl);
        if (cancelled) return;
        if (!receipt) {
          setStatus("missing");
          return;
        }
        url = URL.createObjectURL(receipt.blob);
        setObjectUrl(url);
        setFileType(receipt.type);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("missing");
      }
    })();

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [receiptUrl]);

  if (status === "loading") {
    return (
      <div className="flex h-72 animate-pulse items-center justify-center rounded-xl bg-slate-100 text-sm text-slate-400">
        Loading receipt...
      </div>
    );
  }

  if (status === "missing" || !objectUrl) {
    return (
      <div className="flex h-72 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-400">
        Receipt file not found in this browser
      </div>
    );
  }

  if (fileType.startsWith("image/")) {
    return (
      <a
        href={objectUrl}
        target="_blank"
        rel="noopener noreferrer"
        title="Open full size in a new tab"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- blob object URL, not optimizable */}
        <img
          src={objectUrl}
          alt={fileName ?? "Receipt"}
          className="max-h-[28rem] w-full rounded-xl border border-slate-200 object-contain"
        />
      </a>
    );
  }

  // PDF
  return (
    <div>
      <iframe
        src={objectUrl}
        title={fileName ?? "Receipt PDF"}
        className="h-[28rem] w-full rounded-xl border border-slate-200 bg-white"
      />
      <a
        href={objectUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-block text-sm font-medium text-emerald-700 hover:underline"
      >
        Open {fileName ?? "PDF"} in a new tab
      </a>
    </div>
  );
}
