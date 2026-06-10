"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useData } from "@/lib/data-context";
import type { Company } from "@/lib/types";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";

export function CompanyFormModal({
  company,
  trigger,
  triggerClassName,
}: {
  /** When provided, the modal edits this company; otherwise it creates one. */
  company?: Company;
  trigger: ReactNode;
  triggerClassName: string;
}) {
  const { addCompany, updateCompany } = useData();
  const isEdit = Boolean(company);

  const [open, setOpen] = useState(false);
  const [companyName, setCompanyName] = useState(company?.company_name ?? "");
  const [notes, setNotes] = useState(company?.notes ?? "");

  function openModal() {
    setCompanyName(company?.company_name ?? "");
    setNotes(company?.notes ?? "");
    setOpen(true);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const values = {
      company_name: companyName.trim(),
      notes: notes.trim() || null,
    };

    if (isEdit) {
      updateCompany(company!.id, values);
    } else {
      addCompany(values);
    }

    setOpen(false);
  }

  return (
    <>
      <button type="button" onClick={openModal} className={triggerClassName}>
        {trigger}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-slate-900/50"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl sm:p-8">
            <h2 className="text-lg font-semibold text-slate-900">
              {isEdit ? "Edit Company" : "New Company"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {isEdit
                ? "Update the company details below."
                : "Create a company to group related project tabs."}
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <div>
                <label
                  htmlFor="company_name"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Company Name
                </label>
                <input
                  id="company_name"
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. BuildCo Commercial"
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="company_notes"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Notes{" "}
                  <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <textarea
                  id="company_notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything worth remembering about this company..."
                  className={inputClass}
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
                >
                  {isEdit ? "Save Changes" : "Create Company"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
