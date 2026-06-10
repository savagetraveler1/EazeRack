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

Not yet implemented (intentionally — see Roadmap): Google Drive, OCR receipt
scanning, and receipt upload. The Review Receipts screen and the receipt link
field are placeholders only.

## Features

- **Dashboard** — total projects, total expenses, expenses this month, recent expenses
- **Projects** — create, edit, and list projects (name, client, status)
- **Project detail** — total expenses, category totals, full expense history
- **Add expense** — project, vendor, date, amount, category, notes, plus a receipt link placeholder field
- **Review receipts** — placeholder screen for the future Google Drive + OCR receipt pipeline

## Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you land directly on the dashboard. No account or sign-in needed.

The app is seeded with sample projects and expenses so every screen has data. Anything you add or edit is saved to your browser's localStorage.

## Project Structure

```
src/
  app/
    (app)/
      dashboard/        Dashboard with stat cards + recent expenses
      projects/         Project list, create & edit
      projects/[id]/    Project detail: totals, category breakdown, history
      expenses/new/     Add expense form (with receipt link placeholder)
      receipts/review/  Receipt review placeholder screen
  components/           Sidebar, stat cards, forms, expense table
  lib/
    data-context.tsx    Local data layer (localStorage-backed CRUD)
    mock-data.ts        Seed projects & expenses
    types.ts            Domain types (Project, Expense, categories)
    format.ts           Currency & date helpers
```

## Roadmap

The data layer (`src/lib/data-context.tsx`) exposes a single CRUD interface so
the storage backend can be swapped without touching the pages:

1. **Google Drive** — receipt photo storage; each expense gets a `receipt_url`
   (the field and table column already exist as placeholders)
2. **OCR receipt scanning** — extract vendor/date/amount from uploaded
   receipts and queue them on the Review Receipts screen
3. **Google Sheets** — replace localStorage with per-project expense sheets as
   the source of truth
