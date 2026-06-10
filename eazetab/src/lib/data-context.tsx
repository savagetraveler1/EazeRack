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
  Expense,
  ExpenseInput,
  Project,
  ProjectInput,
} from "@/lib/types";
import { SEED_EXPENSES, SEED_PROJECTS } from "@/lib/mock-data";
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
  projects: Project[];
  expenses: Expense[];
};

type DataContextValue = {
  /** False until localStorage has been read on the client. */
  hydrated: boolean;
  projects: Project[];
  expenses: Expense[];
  addProject: (input: ProjectInput) => Project;
  updateProject: (id: string, input: ProjectInput) => void;
  deleteProject: (id: string) => Promise<void>;
  addExpense: (input: ExpenseInput) => Expense;
  deleteExpense: (id: string) => Promise<void>;
};

const DataContext = createContext<DataContextValue | null>(null);

function loadData(): StoredData {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredData;
      if (Array.isArray(parsed.projects) && Array.isArray(parsed.expenses)) {
        return parsed;
      }
    }
  } catch {
    // Corrupted storage; fall through to seed data.
  }
  return { projects: SEED_PROJECTS, expenses: SEED_EXPENSES };
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [data, setData] = useState<StoredData>({ projects: [], expenses: [] });

  useEffect(() => {
    setData(loadData());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  }, [data, hydrated]);

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
        projects: data.projects,
        expenses: data.expenses,
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
