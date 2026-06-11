import type { Expense } from "@/lib/types";

export function expenseCategoryLabel(
  expense: Pick<Expense, "category" | "custom_category">
): string {
  if (expense.category === "Other") {
    return expense.custom_category?.trim() || "Other";
  }
  return expense.category;
}
