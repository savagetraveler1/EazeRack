/**
 * Client-side receipt OCR for the local MVP.
 *
 * Runs in the browser only. Image receipts are scanned with Tesseract.js; PDFs
 * render their first page to a canvas and then use the same OCR path.
 */

import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/lib/types";

export type OcrSuggestions = {
  vendor: string | null;
  expense_date: string | null;
  amount: number | null;
  category: ExpenseCategory | null;
};

export type OcrResult = {
  suggestions: OcrSuggestions;
  rawText: string;
};

export async function scanReceipt(
  blob: Blob,
  receiptType: string | null
): Promise<OcrResult> {
  if (receiptType === "application/pdf") {
    return scanReceiptPdf(blob);
  }
  return scanReceiptImage(blob);
}

export async function scanReceiptImage(blob: Blob): Promise<OcrResult> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const {
      data: { text },
    } = await worker.recognize(blob);
    return { rawText: text, suggestions: parseReceiptText(text) };
  } finally {
    await worker.terminate();
  }
}

async function scanReceiptPdf(blob: Blob): Promise<OcrResult> {
  const firstPageImage = await renderFirstPdfPage(blob);
  return scanReceiptImage(firstPageImage);
}

async function renderFirstPdfPage(blob: Blob): Promise<Blob> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url
  ).toString();

  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(await blob.arrayBuffer()),
  }).promise;

  try {
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Could not create a canvas for PDF OCR.");
    }

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    await page.render({ canvas, canvasContext: context, viewport }).promise;

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((imageBlob) => {
        if (imageBlob) {
          resolve(imageBlob);
        } else {
          reject(new Error("Could not render the PDF page for OCR."));
        }
      }, "image/png");
    });
  } finally {
    await pdf.cleanup();
  }
}

export function parseReceiptText(text: string): OcrSuggestions {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const vendor = parseVendor(lines);

  return {
    vendor,
    expense_date: parseDate(text),
    amount: parseAmount(text, lines),
    category: parseCategory(`${vendor ?? ""}\n${text}`),
  };
}

function parseVendor(lines: string[]): string | null {
  for (const line of lines.slice(0, 8)) {
    if (line.length < 3 || line.length > 60) continue;
    if (/^\d+$/.test(line)) continue;
    if (/^(receipt|invoice|order|store|tel|phone|www\.|http)/i.test(line)) {
      continue;
    }
    if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(line)) continue;
    if (/^\$?\d/.test(line)) continue;
    return line;
  }
  return null;
}

function parseDate(text: string): string | null {
  const patterns: RegExp[] = [
    /\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b/,
    /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/,
    /\b(\d{1,2})[/-](\d{1,2})[/-](\d{2})\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    let year: number;
    let month: number;
    let day: number;

    if (match[1].length === 4) {
      year = Number(match[1]);
      month = Number(match[2]);
      day = Number(match[3]);
    } else {
      month = Number(match[1]);
      day = Number(match[2]);
      const y = Number(match[3]);
      year = y < 100 ? 2000 + y : y;
    }

    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return null;
}

function parseAmount(text: string, lines: string[]): number | null {
  const candidates = collectAmountCandidates(lines);
  const finalTotal = candidates
    .filter((candidate) => candidate.kind === "final")
    .sort(compareAmountCandidates)[0];
  if (finalTotal) return finalTotal.amount;

  const subtotal = candidates
    .filter((candidate) => candidate.kind === "subtotal")
    .sort(compareAmountCandidates)[0];
  if (subtotal) return subtotal.amount;

  return extractFirstAmount(text);
}

type AmountCandidate = {
  amount: number;
  kind: "final" | "subtotal";
  labelPriority: number;
  sameLine: boolean;
  lineIndex: number;
};

const SUBTOTAL_PATTERN = /\bsub\s*total\b|\bsubtotal\b/i;
const NON_FINAL_TOTAL_PATTERN =
  /\b(sub\s*total|subtotal|sales\s*tax|tax|discount|savings?|refund|change)\b/i;

const FINAL_AMOUNT_LABELS: Array<{ pattern: RegExp; priority: number }> = [
  { pattern: /\btotal\b/i, priority: 1 },
  { pattern: /\btotal\s*due\b/i, priority: 2 },
  { pattern: /\bamount\s*paid\b/i, priority: 3 },
  { pattern: /\bpaid\b/i, priority: 4 },
  { pattern: /\bdebit\b/i, priority: 5 },
  { pattern: /\bcredit\b/i, priority: 6 },
];

function collectAmountCandidates(lines: string[]): AmountCandidate[] {
  const candidates: AmountCandidate[] = [];

  lines.forEach((line, lineIndex) => {
    const subtotalAmount = getSameLineAmountForLabel(line, SUBTOTAL_PATTERN);
    if (subtotalAmount !== null) {
      candidates.push({
        amount: subtotalAmount,
        kind: "subtotal",
        labelPriority: 100,
        sameLine: true,
        lineIndex,
      });
    }

    if (NON_FINAL_TOTAL_PATTERN.test(line)) {
      return;
    }

    for (const label of FINAL_AMOUNT_LABELS) {
      if (!label.pattern.test(line)) continue;

      const sameLineAmount = extractLastAmount(line);
      if (sameLineAmount !== null) {
        candidates.push({
          amount: sameLineAmount,
          kind: "final",
          labelPriority: label.priority,
          sameLine: true,
          lineIndex,
        });
        continue;
      }

      for (const nearbyLine of [lines[lineIndex + 1], lines[lineIndex - 1]]) {
        if (!nearbyLine || SUBTOTAL_PATTERN.test(nearbyLine)) continue;
        const nearbyAmount = extractLastAmount(nearbyLine);
        if (nearbyAmount === null) continue;

        candidates.push({
          amount: nearbyAmount,
          kind: "final",
          labelPriority: label.priority,
          sameLine: false,
          lineIndex,
        });
      }
    }
  });

  return candidates;
}

function getSameLineAmountForLabel(line: string, label: RegExp): number | null {
  if (!label.test(line)) return null;
  return extractLastAmount(line);
}

function compareAmountCandidates(a: AmountCandidate, b: AmountCandidate): number {
  const kindScore = candidateKindScore(b) - candidateKindScore(a);
  if (kindScore !== 0) return kindScore;

  const sameLineScore = Number(b.sameLine) - Number(a.sameLine);
  if (sameLineScore !== 0) return sameLineScore;

  const priorityScore = a.labelPriority - b.labelPriority;
  if (priorityScore !== 0) return priorityScore;

  return b.lineIndex - a.lineIndex;
}

function candidateKindScore(candidate: AmountCandidate): number {
  return candidate.kind === "final" ? 2 : 1;
}

function extractLastAmount(text: string): number | null {
  const amounts = extractAmounts(text);
  return amounts.at(-1) ?? null;
}

function extractFirstAmount(text: string): number | null {
  const amounts = extractAmounts(text);
  return amounts[0] ?? null;
}

function extractAmounts(text: string): number[] {
  const matches = text.matchAll(
    /\$?\s*(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})/g
  );

  return [...matches]
    .map((match) => Number.parseFloat(match[1].replace(/,/g, "")))
    .filter((amount) => amount > 0 && amount < 1_000_000);
}

function parseCategory(text: string): ExpenseCategory | null {
  const normalized = text.toLowerCase();
  const rules: Array<{ category: ExpenseCategory; pattern: RegExp }> = [
    {
      category: "Fuel",
      pattern: /\b(fuel|gas|gasoline|diesel|shell|chevron|exxon|bp)\b/,
    },
    {
      category: "Hotel",
      pattern: /\b(hotel|motel|inn|lodging|hampton|marriott|hilton)\b/,
    },
    {
      category: "Meals",
      pattern: /\b(meal|restaurant|cafe|coffee|lunch|dinner|chipotle)\b/,
    },
    {
      category: "Rental Car",
      pattern: /\b(rental car|car rental|enterprise|hertz|avis|budget)\b/,
    },
    {
      category: "Shipping",
      pattern: /\b(shipping|ship|ups|fedex|usps|postage)\b/,
    },
    {
      category: "Materials",
      pattern:
        /\b(material|lumber|hardware|depot|lowe'?s|grainger|plumbing|electrical|supply)\b/,
    },
  ];

  return (
    rules.find(
      (rule) =>
        EXPENSE_CATEGORIES.includes(rule.category) &&
        rule.pattern.test(normalized)
    )?.category ?? null
  );
}
