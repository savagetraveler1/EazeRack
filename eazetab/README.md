# EazeTab

A simple project receipt tracker — every project has a running "tab" of expenses.

Built with **Next.js 15**, **TypeScript**, and **Tailwind CSS**.

> **Local MVP** — no backend, no Supabase, and no login required. All data is
> mock/local and stored in your browser (localStorage). Google Drive + Google
> Sheets integration comes later.

## MVP Status — Confirmed Working (checkpoint: Jun 10, 2026)

All core flows verified end-to-end in a real browser:

- [x] `/` opens straight to the dashboard (no login)
- [x] Projects can be created and edited (name, client, status)
- [x] Expenses can be added to any project
- [x] Project detail totals & category breakdown update with new expenses
- [x] Dashboard totals (projects, total expenses, this month) update
- [x] Data persists after a page refresh (localStorage)
- [x] **Local receipt attachments** — attach an image or PDF when adding an
      expense, then open it via "View Receipt" in any expense table
- [x] **Receipt Review v1 (manual)** — expenses with a receipt route to a
      review page (receipt preview + editable details) before saving;
      expenses without a receipt still save immediately
- [x] **OCR suggestions v1 (local)** — image receipts are scanned on the
      review page (Tesseract.js in-browser); vendor, date, and amount
      suggestions can be applied with one click before saving
- [x] **Safe delete** — delete projects or individual expenses with a
      confirmation modal; project delete removes all attached expenses;
      expense delete removes local receipt files from IndexedDB; totals
      update immediately and changes persist after refresh

Not yet implemented (intentionally — see Roadmap): Google Drive and Google
Sheets. OCR does not run on PDFs yet.

## Features

- **Dashboard** — total projects, total expenses, expenses this month, recent expenses
- **Projects** — create, edit, and list projects (name, client, status)
- **Project detail** — total expenses, category totals, full expense history
- **Add expense** — project, vendor, date, amount, category, notes, plus an optional receipt attachment (image or PDF, up to 10 MB)
- **Receipt attachments** — receipt files are stored locally in the browser (IndexedDB); expenses with a receipt show a "View Receipt" link that opens the file in a new tab
- **Receipt review** — adding an expense with a receipt routes to a review step first: image receipts preview inline, PDFs embed with an open-in-tab link, all expense fields stay editable, and the receipt can be removed or replaced before "Approve & Save" posts it to the project tab. Expenses without a receipt skip review and save immediately.
- **OCR suggestions** — on the review step, image receipts are scanned locally (Tesseract.js) to suggest vendor, date, and amount. Click **Apply OCR suggestions** to fill the form; fields are still fully editable before you approve.
- **Safe delete** — every project card and expense row has a **Delete** button. A confirmation modal explains exactly what will be removed (including attached receipt files). Cancel closes the modal without changes. Deleting a project from its detail page returns you to the project list.

## Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you land directly on the dashboard. No account or sign-in needed.

The app is seeded with sample projects and expenses so every screen has data. Anything you add or edit is saved to your browser's localStorage; attached receipt files are saved to the browser's IndexedDB.

## Project Structure

```
src/
  app/
    (app)/
      dashboard/        Dashboard with stat cards + recent expenses
      projects/         Project list, create & edit
      projects/[id]/    Project detail: totals, category breakdown, history
      expenses/new/     Add expense form (with receipt attachment)
      receipts/review/  Receipt review: approve expense drafts with receipts
  components/           Sidebar, stat cards, forms, expense table, delete dialogs
  lib/
    data-context.tsx    Local data layer (localStorage-backed CRUD)
    receipt-store.ts    Local receipt file storage (IndexedDB)
    draft-store.ts      Pending expense draft for the review step (sessionStorage)
    ocr.ts              Client-side receipt OCR + text parsing (Tesseract.js)
    mock-data.ts        Seed projects & expenses
    types.ts            Domain types (Project, Expense, categories)
    format.ts           Currency & date helpers
```

## Roadmap

The data layer (`src/lib/data-context.tsx`) exposes a single CRUD interface so
the storage backend can be swapped without touching the pages:

1. **Google Drive** — replace local IndexedDB receipt storage with Drive
   uploads; `receipt_url` switches from a `local:<id>` reference to a Drive
   link (the expense field and the "View Receipt" link already handle both)
2. **OCR improvements** — better parsing accuracy, PDF support, optional
   auto-apply when confidence is high
3. **Google Sheets** — replace localStorage with per-project expense sheets as
   the source of truth
