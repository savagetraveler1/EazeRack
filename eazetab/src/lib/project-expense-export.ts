import type { Company, Expense, Project } from "@/lib/types";

const CSV_HEADERS = [
  "Company",
  "Project",
  "Client",
  "Expense Date",
  "Vendor",
  "Category",
  "Amount",
  "Notes",
  "Receipt Link",
];

export function buildProjectExpensesCsv({
  company,
  project,
  expenses,
}: {
  company: Pick<Company, "company_name"> | null;
  project: Pick<Project, "project_name" | "client_name">;
  expenses: Expense[];
}): string {
  const rows = expenses.map((expense) => [
    company?.company_name ?? "",
    project.project_name,
    project.client_name,
    expense.expense_date,
    expense.vendor,
    expense.category,
    expense.amount.toFixed(2),
    expense.notes ?? "",
    expense.receipt_url ?? "",
  ]);

  return [CSV_HEADERS, ...rows]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\r\n");
}

export function projectExpensesCsvFileName({
  companyName,
  projectName,
}: {
  companyName: string | null;
  projectName: string;
}): string {
  return `eazetab-${slugify(companyName ?? "company")}-${slugify(
    projectName
  )}-expenses.csv`;
}

function escapeCsvCell(value: string): string {
  if (!/[",\r\n]/.test(value)) {
    return value;
  }
  return `"${value.replaceAll('"', '""')}"`;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "untitled";
}
