export const PROJECT_STATUSES = ["active", "completed"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const SUBMISSION_STATUSES = ["Open", "Closed"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const EXPENSE_CATEGORIES = [
  "Materials",
  "Fuel",
  "Hotel",
  "Meals",
  "Rental Car",
  "Shipping",
  "Other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export type Company = {
  id: string;
  company_name: string;
  notes: string | null;
  created_at: string;
};

export type Project = {
  id: string;
  company_id: string;
  project_name: string;
  client_name: string;
  status: ProjectStatus;
  created_at: string;
};

export type Submission = {
  id: string;
  project_id: string;
  submission_name: string;
  submitted_at: string | null;
  status: SubmissionStatus;
  notes: string | null;
  created_at: string;
};

export type Expense = {
  id: string;
  project_id: string;
  submission_id: string;
  vendor: string;
  expense_date: string;
  amount: number;
  category: ExpenseCategory;
  /** Used when category is "Other"; falls back to "Other" when empty. */
  custom_category: string | null;
  notes: string | null;
  /** Placeholder for the future Google Drive receipt link. */
  receipt_url: string | null;
  created_at: string;
};

/** Expense joined with its parent project (for dashboard / lists). */
export type ExpenseWithProject = Expense & {
  project: Pick<Project, "id" | "project_name"> | null;
};

export type CompanyInput = Omit<Company, "id" | "created_at">;
export type ProjectInput = Omit<Project, "id" | "created_at">;
export type ExpenseInput = Omit<Expense, "id" | "created_at">;
