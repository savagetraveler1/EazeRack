/**
 * Client-side receipt OCR for the local MVP.
 *
 * Runs in the browser only. Image receipts are scanned with Tesseract.js; PDFs
 * are attached and reviewed manually until PDF rendering is added.
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
  const totalKeywords =
    /total|amount\s*due|balance\s*due|grand\s*total|subtotal/i;

  for (const line of lines) {
    if (!totalKeywords.test(line)) continue;
    const amount = extractLargestAmount(line);
    if (amount !== null) return amount;
  }

  return extractLargestAmount(text);
}

function extractLargestAmount(text: string): number | null {
  const matches = [
    ...text.matchAll(/\$?\s*(\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})/g),
  ];
  if (matches.length === 0) return null;

  const amounts = matches
    .map((match) => Number.parseFloat(match[1].replace(/,/g, "")))
    .filter((amount) => amount > 0 && amount < 1_000_000);

  if (amounts.length === 0) return null;
  return Math.max(...amounts);
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
