import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Review Receipts" };

const PIPELINE_STEPS = [
  {
    title: "Upload to Google Drive",
    description:
      "Snap a photo of a receipt and it lands in your project's Drive folder.",
  },
  {
    title: "OCR scan",
    description:
      "EazeTab reads the vendor, date, and amount off the receipt automatically.",
  },
  {
    title: "Review & approve",
    description:
      "Confirm the extracted details here, fix anything that's off, and post it to the project tab.",
  },
  {
    title: "Synced to Google Sheets",
    description:
      "Every approved expense is written to your project's expense sheet.",
  },
];

export default function ReviewReceiptsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        Review Receipts
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Scanned receipts will queue up here for review before they hit a
        project&apos;s tab.
      </p>

      {/* Placeholder dropzone */}
      <div className="mt-8 rounded-2xl border-2 border-dashed border-slate-300 bg-white px-6 py-16 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-7 w-7">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h2 className="mt-4 text-base font-semibold text-slate-900">
          Receipt scanning is coming soon
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
          Once Google Drive is connected, receipts you upload will appear here
          with their details pre-filled by OCR — ready to review and post.
        </p>
        <span className="mt-5 inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
          Planned — Google Drive + OCR integration
        </span>
      </div>

      {/* How it will work */}
      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-base font-semibold text-slate-900">
          How it will work
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

      <p className="mt-8 text-center text-sm text-slate-500">
        In the meantime, you can{" "}
        <Link
          href="/expenses/new"
          className="font-medium text-emerald-700 hover:underline"
        >
          add expenses manually
        </Link>
        .
      </p>
    </div>
  );
}
