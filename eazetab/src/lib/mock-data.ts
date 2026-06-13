import type { Company, Expense, Project, Submission } from "@/lib/types";

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timestampDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export const SEED_COMPANIES: Company[] = [
  {
    id: "c-buildco",
    company_name: "BuildCo Commercial",
    notes: "Commercial and office projects.",
    created_at: timestampDaysAgo(60),
  },
  {
    id: "c-homeworks",
    company_name: "HomeWorks Residential",
    notes: "Residential remodels and service calls.",
    created_at: timestampDaysAgo(35),
  },
];

export const SEED_PROJECTS: Project[] = [
  {
    id: "p-riverside",
    company_id: "c-buildco",
    project_name: "Riverside Office Build-Out",
    client_name: "Acme Corp",
    status: "active",
    created_at: timestampDaysAgo(45),
  },
  {
    id: "p-lakeview",
    company_id: "c-homeworks",
    project_name: "Lakeview Kitchen Remodel",
    client_name: "The Hendersons",
    status: "active",
    created_at: timestampDaysAgo(20),
  },
  {
    id: "p-warehouse",
    company_id: "c-buildco",
    project_name: "Warehouse Lighting Upgrade",
    client_name: "Midwest Logistics",
    status: "completed",
    created_at: timestampDaysAgo(90),
  },
];

export const SEED_SUBMISSIONS: Submission[] = [
  {
    id: "s-riverside-expense-bom",
    project_id: "p-riverside",
    submission_name: "Expense BOM",
    submitted_at: null,
    status: "Open",
    notes: "Initial project materials and jobsite purchases.",
    created_at: timestampDaysAgo(2),
  },
  {
    id: "s-lakeview-initial-materials",
    project_id: "p-lakeview",
    submission_name: "Initial Materials",
    submitted_at: null,
    status: "Open",
    notes: "First receipt batch for the kitchen remodel.",
    created_at: timestampDaysAgo(5),
  },
  {
    id: "s-warehouse-final-materials",
    project_id: "p-warehouse",
    submission_name: "Final Materials",
    submitted_at: daysAgo(32),
    status: "Closed",
    notes: "Closeout receipts for the lighting upgrade.",
    created_at: timestampDaysAgo(32),
  },
];

export const SEED_EXPENSES: Expense[] = [
  {
    id: "e-1",
    project_id: "p-riverside",
    submission_id: "s-riverside-expense-bom",
    vendor: "Home Depot",
    expense_date: daysAgo(2),
    amount: 482.16,
    category: "Materials",
    custom_category: null,
    notes: "Drywall, screws, joint compound",
    receipt_url: null,
    created_at: timestampDaysAgo(2),
  },
  {
    id: "e-2",
    project_id: "p-riverside",
    submission_id: "s-riverside-expense-bom",
    vendor: "Shell",
    expense_date: daysAgo(3),
    amount: 64.5,
    category: "Fuel",
    custom_category: null,
    notes: null,
    receipt_url: null,
    created_at: timestampDaysAgo(3),
  },
  {
    id: "e-3",
    project_id: "p-lakeview",
    submission_id: "s-lakeview-initial-materials",
    vendor: "Ferguson Plumbing",
    expense_date: daysAgo(5),
    amount: 1240.0,
    category: "Materials",
    custom_category: null,
    notes: "Sink, faucet, supply lines",
    receipt_url: null,
    created_at: timestampDaysAgo(5),
  },
  {
    id: "e-4",
    project_id: "p-lakeview",
    submission_id: "s-lakeview-initial-materials",
    vendor: "Chipotle",
    expense_date: daysAgo(5),
    amount: 38.74,
    category: "Meals",
    custom_category: null,
    notes: "Crew lunch",
    receipt_url: null,
    created_at: timestampDaysAgo(5),
  },
  {
    id: "e-5",
    project_id: "p-warehouse",
    submission_id: "s-warehouse-final-materials",
    vendor: "Grainger",
    expense_date: daysAgo(32),
    amount: 3185.9,
    category: "Materials",
    custom_category: null,
    notes: "LED high-bay fixtures (x24)",
    receipt_url: null,
    created_at: timestampDaysAgo(32),
  },
  {
    id: "e-6",
    project_id: "p-warehouse",
    submission_id: "s-warehouse-final-materials",
    vendor: "Hampton Inn",
    expense_date: daysAgo(34),
    amount: 276.0,
    category: "Hotel",
    custom_category: null,
    notes: "2 nights, install crew",
    receipt_url: null,
    created_at: timestampDaysAgo(34),
  },
  {
    id: "e-7",
    project_id: "p-riverside",
    submission_id: "s-riverside-expense-bom",
    vendor: "UPS Store",
    expense_date: daysAgo(10),
    amount: 42.3,
    category: "Shipping",
    custom_category: null,
    notes: "Returned defective fixtures",
    receipt_url: null,
    created_at: timestampDaysAgo(10),
  },
  {
    id: "e-8",
    project_id: "p-lakeview",
    submission_id: "s-lakeview-initial-materials",
    vendor: "Enterprise",
    expense_date: daysAgo(8),
    amount: 189.99,
    category: "Rental Car",
    custom_category: null,
    notes: "Cargo van, 2 days",
    receipt_url: null,
    created_at: timestampDaysAgo(8),
  },
];
