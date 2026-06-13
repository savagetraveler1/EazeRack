"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type {
  Company,
  CompanyInput,
  Expense,
  ExpenseInput,
  Project,
  ProjectInput,
  Submission,
} from "@/lib/types";
import {
  SEED_COMPANIES,
  SEED_EXPENSES,
  SEED_PROJECTS,
  SEED_SUBMISSIONS,
} from "@/lib/mock-data";
import { deleteReceipt } from "@/lib/receipt-store";

/**
 * Local data layer for the MVP.
 *
 * Data lives in localStorage so the app works fully offline with no backend.
 * When Google Drive / Google Sheets integration lands, this context keeps the
 * same interface and swaps localStorage reads/writes for Sheets API calls.
 */

const STORAGE_KEY = "eazetab-data-v1";

type StoredData = {
  companies: Company[];
  projects: Project[];
  submissions: Submission[];
  expenses: Expense[];
};

type DataContextValue = {
  /** False until localStorage has been read on the client. */
  hydrated: boolean;
  companies: Company[];
  projects: Project[];
  submissions: Submission[];
  expenses: Expense[];
  addCompany: (input: CompanyInput) => Company;
  updateCompany: (id: string, input: CompanyInput) => void;
  deleteCompany: (id: string) => Promise<void>;
  addProject: (input: ProjectInput) => Project;
  updateProject: (id: string, input: ProjectInput) => void;
  deleteProject: (id: string) => Promise<void>;
  getOrCreateActiveSubmission: (projectId: string) => Submission | null;
  closeActiveSubmission: (projectId: string) => void;
  addExpense: (input: ExpenseInput) => Expense;
  deleteExpense: (id: string) => Promise<void>;
};

const DataContext = createContext<DataContextValue | null>(null);

function normalizeData(parsed: Partial<StoredData>): StoredData {
  const parsedCompanies = Array.isArray(parsed.companies)
    ? parsed.companies.filter(
        (company): company is Company =>
          typeof company?.id === "string" &&
          typeof company?.company_name === "string"
      )
    : [];
  const companies =
    parsedCompanies.length > 0 ? parsedCompanies : SEED_COMPANIES;
  const fallbackCompanyId = companies[0]?.id ?? SEED_COMPANIES[0].id;
  const companyIds = new Set(companies.map((company) => company.id));
  const projects = Array.isArray(parsed.projects)
    ? parsed.projects
        .filter(
          (project): project is Project =>
            typeof project?.id === "string" &&
            typeof project?.project_name === "string" &&
            typeof project?.client_name === "string"
        )
        .map((project) => ({
          ...project,
          company_id: companyIds.has(project.company_id)
            ? project.company_id
            : fallbackCompanyId,
        }))
    : SEED_PROJECTS;
  const projectIds = new Set(projects.map((p) => p.id));
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const parsedSubmissions = Array.isArray(parsed.submissions)
    ? parsed.submissions
        .filter(
          (submission): submission is Submission =>
            typeof submission?.id === "string" &&
            typeof submission?.project_id === "string" &&
            typeof submission?.submission_name === "string" &&
            projectIds.has(submission.project_id)
        )
        .map((submission): Submission => ({
          ...submission,
          status: submission.status === "Closed" ? "Closed" : "Open",
          submitted_at:
            submission.status === "Closed"
              ? typeof submission.submitted_at === "string"
                ? submission.submitted_at
                : todayISODate()
              : null,
          notes: submission.notes ?? null,
        }))
    : [];
  const submissions = normalizeProjectSubmissions(
    projects,
    parsedSubmissions.length > 0
      ? parsedSubmissions
      : Array.isArray(parsed.submissions)
        ? []
        : SEED_SUBMISSIONS.filter((submission) =>
            projectIds.has(submission.project_id)
          )
  );
  const submissionsByProject = new Map<string, Submission>();
  for (const submission of submissions) {
    if (!submissionsByProject.has(submission.project_id)) {
      submissionsByProject.set(submission.project_id, submission);
    }
  }
  const submissionIds = new Set(submissions.map((submission) => submission.id));
  const expenses = Array.isArray(parsed.expenses)
    ? parsed.expenses
        .filter(
          (expense): expense is Expense =>
            typeof expense?.id === "string" &&
            typeof expense?.project_id === "string" &&
            projectIds.has(expense.project_id)
        )
        .map((expense) => ({
          ...expense,
          submission_id:
            typeof expense.submission_id === "string" &&
            submissionIds.has(expense.submission_id)
              ? expense.submission_id
              : getMigrationSubmission(
                  expense.project_id,
                  projectById,
                  submissions,
                  submissionsByProject,
                  submissionIds
                ).id,
          custom_category: expense.custom_category ?? null,
        }))
    : SEED_EXPENSES;

  return { companies, projects, submissions, expenses };
}

function getMigrationSubmission(
  projectId: string,
  projectById: Map<string, Project>,
  submissions: Submission[],
  submissionsByProject: Map<string, Submission>,
  submissionIds: Set<string>
): Submission {
  const existing = submissionsByProject.get(projectId);
  if (existing) return existing;

  const project = projectById.get(projectId);
  const submission: Submission = {
    id: `migration-${projectId}`,
    project_id: projectId,
    submission_name: "Migrated Expenses",
    submitted_at: project?.status === "completed" ? todayISODate() : null,
    status: project?.status === "completed" ? "Closed" : "Open",
    notes: "Created automatically for expenses saved before submissions existed.",
    created_at: new Date().toISOString(),
  };
  submissions.push(submission);
  submissionsByProject.set(projectId, submission);
  submissionIds.add(submission.id);
  return submission;
}

function normalizeProjectSubmissions(
  projects: Project[],
  submissions: Submission[]
): Submission[] {
  const submissionsByProject = new Map<string, Submission[]>();

  for (const submission of submissions) {
    const list = submissionsByProject.get(submission.project_id) ?? [];
    list.push(submission);
    submissionsByProject.set(submission.project_id, list);
  }

  const normalized: Submission[] = [];

  for (const project of projects) {
    const projectSubmissions = submissionsByProject.get(project.id) ?? [];
    const sortedOpenSubmissions = projectSubmissions
      .filter((submission) => submission.status === "Open")
      .sort(compareSubmissionsNewestFirst);
    const activeSubmission =
      project.status === "active" ? sortedOpenSubmissions[0] : null;

    if (project.status === "active" && !activeSubmission) {
      normalized.push(createOpenSubmission(project));
    }

    for (const submission of projectSubmissions) {
      if (submission.status === "Open") {
        if (activeSubmission?.id === submission.id) {
          normalized.push({ ...submission, submitted_at: null });
        } else {
          normalized.push(closeSubmission(submission));
        }
      } else {
        normalized.push(closeSubmission(submission));
      }
    }
  }

  return normalized;
}

function createOpenSubmission(project: Pick<Project, "id" | "project_name">) {
  const createdAt = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    project_id: project.id,
    submission_name: `${todayISODate()} - ${project.project_name}`,
    submitted_at: null,
    status: "Open" as const,
    notes: null,
    created_at: createdAt,
  };
}

function closeSubmission(submission: Submission): Submission {
  return {
    ...submission,
    status: "Closed",
    submitted_at: submission.submitted_at ?? todayISODate(),
  };
}

function compareSubmissionsNewestFirst(a: Submission, b: Submission): number {
  return (
    (b.submitted_at ?? "").localeCompare(a.submitted_at ?? "") ||
    b.created_at.localeCompare(a.created_at)
  );
}

function todayISODate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function loadData(): StoredData {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredData>;
      if (Array.isArray(parsed.projects) && Array.isArray(parsed.expenses)) {
        return normalizeData(parsed);
      }
    }
  } catch {
    // Corrupted storage; fall through to seed data.
  }
  return {
    companies: SEED_COMPANIES,
    projects: SEED_PROJECTS,
    submissions: SEED_SUBMISSIONS,
    expenses: SEED_EXPENSES,
  };
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [data, setData] = useState<StoredData>({
    companies: [],
    projects: [],
    submissions: [],
    expenses: [],
  });

  useEffect(() => {
    setData(loadData());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  }, [data, hydrated]);

  const addCompany = useCallback((input: CompanyInput): Company => {
    const company: Company = {
      ...input,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    setData((d) => ({ ...d, companies: [company, ...d.companies] }));
    return company;
  }, []);

  const updateCompany = useCallback((id: string, input: CompanyInput) => {
    setData((d) => ({
      ...d,
      companies: d.companies.map((c) =>
        c.id === id ? { ...c, ...input } : c
      ),
    }));
  }, []);

  const addProject = useCallback((input: ProjectInput): Project => {
    const project: Project = {
      ...input,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    setData((d) => ({
      ...d,
      projects: [project, ...d.projects],
      submissions:
        project.status === "active"
          ? [createOpenSubmission(project), ...d.submissions]
          : d.submissions,
    }));
    return project;
  }, []);

  const updateProject = useCallback((id: string, input: ProjectInput) => {
    setData((d) => ({
      ...d,
      projects: d.projects.map((p) => (p.id === id ? { ...p, ...input } : p)),
      submissions: normalizeProjectSubmissions(
        d.projects.map((p) => (p.id === id ? { ...p, ...input } : p)),
        d.submissions
      ),
    }));
  }, []);

  const getOrCreateActiveSubmission = useCallback(
    (projectId: string): Submission | null => {
      const project = data.projects.find((p) => p.id === projectId);
      if (!project || project.status === "completed") {
        return null;
      }

      const existing = data.submissions.find(
        (submission) =>
          submission.project_id === projectId && submission.status === "Open"
      );
      if (existing) {
        return existing;
      }

      const candidateSubmission = createOpenSubmission(project);
      let activeSubmission: Submission | null = candidateSubmission;
      setData((d) => ({
        ...d,
        submissions: (() => {
          const latestProject = d.projects.find((p) => p.id === projectId);
          if (!latestProject || latestProject.status === "completed") {
            activeSubmission = null;
            return d.submissions;
          }
          const latestOpen = d.submissions.find(
            (submission) =>
              submission.project_id === projectId &&
              submission.status === "Open"
          );
          if (latestOpen) {
            activeSubmission = latestOpen;
            return d.submissions;
          }
          return [candidateSubmission, ...d.submissions];
        })(),
      }));

      return activeSubmission;
    },
    [data.projects, data.submissions]
  );

  const closeActiveSubmission = useCallback((projectId: string) => {
    setData((d) => ({
      ...d,
      submissions: d.submissions.map((submission) =>
        submission.project_id === projectId && submission.status === "Open"
          ? closeSubmission(submission)
          : submission
      ),
    }));
  }, []);

  const addExpense = useCallback((input: ExpenseInput): Expense => {
    const expense: Expense = {
      ...input,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    setData((d) => ({ ...d, expenses: [expense, ...d.expenses] }));
    return expense;
  }, []);

  const deleteCompany = useCallback(async (id: string): Promise<void> => {
    const receiptUrls: string[] = [];

    setData((d) => {
      const projectIds = new Set(
        d.projects.filter((p) => p.company_id === id).map((p) => p.id)
      );
      const companyExpenses = d.expenses.filter((e) =>
        projectIds.has(e.project_id)
      );
      for (const expense of companyExpenses) {
        if (expense.receipt_url) {
          receiptUrls.push(expense.receipt_url);
        }
      }
      return {
        companies: d.companies.filter((c) => c.id !== id),
        projects: d.projects.filter((p) => p.company_id !== id),
        submissions: d.submissions.filter((submission) =>
          !projectIds.has(submission.project_id)
        ),
        expenses: d.expenses.filter((e) => !projectIds.has(e.project_id)),
      };
    });

    await Promise.all(receiptUrls.map((url) => deleteReceipt(url)));
  }, []);

  const deleteProject = useCallback(async (id: string): Promise<void> => {
    const receiptUrls: string[] = [];

    setData((d) => {
      const projectExpenses = d.expenses.filter((e) => e.project_id === id);
      for (const expense of projectExpenses) {
        if (expense.receipt_url) {
          receiptUrls.push(expense.receipt_url);
        }
      }
      return {
        ...d,
        projects: d.projects.filter((p) => p.id !== id),
        submissions: d.submissions.filter(
          (submission) => submission.project_id !== id
        ),
        expenses: d.expenses.filter((e) => e.project_id !== id),
      };
    });

    await Promise.all(receiptUrls.map((url) => deleteReceipt(url)));
  }, []);

  const deleteExpense = useCallback(async (id: string): Promise<void> => {
    let receiptUrl: string | null = null;

    setData((d) => {
      const expense = d.expenses.find((e) => e.id === id);
      if (!expense) {
        return d;
      }
      receiptUrl = expense.receipt_url ?? null;
      return {
        ...d,
        expenses: d.expenses.filter((e) => e.id !== id),
      };
    });

    if (receiptUrl) {
      await deleteReceipt(receiptUrl);
    }
  }, []);

  return (
    <DataContext.Provider
      value={{
        hydrated,
        companies: data.companies,
        projects: data.projects,
        submissions: data.submissions,
        expenses: data.expenses,
        addCompany,
        updateCompany,
        deleteCompany,
        addProject,
        updateProject,
        deleteProject,
        getOrCreateActiveSubmission,
        closeActiveSubmission,
        addExpense,
        deleteExpense,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) {
    throw new Error("useData must be used within a DataProvider");
  }
  return ctx;
}

/** Expenses sorted newest-first by expense date, then created time. */
export function sortExpenses<T extends Expense>(expenses: T[]): T[] {
  return [...expenses].sort(
    (a, b) =>
      b.expense_date.localeCompare(a.expense_date) ||
      b.created_at.localeCompare(a.created_at)
  );
}
