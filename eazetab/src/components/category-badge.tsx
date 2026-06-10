import type { ExpenseCategory } from "@/lib/types";

const CATEGORY_STYLES: Record<ExpenseCategory, string> = {
  Materials: "bg-blue-50 text-blue-700",
  Fuel: "bg-amber-50 text-amber-700",
  Hotel: "bg-purple-50 text-purple-700",
  Meals: "bg-rose-50 text-rose-700",
  "Rental Car": "bg-cyan-50 text-cyan-700",
  Shipping: "bg-indigo-50 text-indigo-700",
  Other: "bg-slate-100 text-slate-600",
};

export function CategoryBadge({ category }: { category: ExpenseCategory }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        CATEGORY_STYLES[category] ?? CATEGORY_STYLES.Other
      }`}
    >
      {category}
    </span>
  );
}
