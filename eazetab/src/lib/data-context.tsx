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
} from "@/lib/types";
import { SEED_COMPANIES, SEED_EXPENSES, SEED_PROJECTS } from "@/lib/mock-data";
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
  expenses: Expense[];
};

type DataContextValue = {
  /** False until localStorage has been read on the client. */
  hydrated: boolean;
  companies: Company[];
  projects: Project[];
  expenses: Expense[];
  addCompany: (input: CompanyInput) => Company;
  updateCompany: (id: string, input: CompanyInput) => void;
  deleteCompany: (id: string) => Promise<void>;
  addProject: (input: ProjectInput) => Project;
  updateProject: (id: string, input: ProjectInput) => void;
  deleteProject: (id: string) => Promise<void>;
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
  const expenses = Array.isArray(parsed.expenses)
    ? parsed.expenses.filter(
        (expense): expense is Expense =>
          typeof expense?.id === "string" &&
          typeof expense?.project_id === "string" &&
          projectIds.has(expense.project_id)
      )
    : SEED_EXPENSES;

  return { companies, projects, expenses };
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
    expenses: SEED_EXPENSES,
  };
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [data, setData] = useState<StoredData>({
    companies: [],
    projects: [],
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
    setData((d) => ({ ...d, projects: [project, ...d.projects] }));
    return project;
  }, []);

  const updateProject = useCallback((id: string, input: ProjectInput) => {
    setData((d) => ({
      ...d,
      projects: d.projects.map((p) => (p.id === id ? { ...p, ...input } : p)),
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
        expenses: data.expenses,
        addCompany,
        updateCompany,
        deleteCompany,
        addProject,
        updateProject,
        deleteProject,
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
