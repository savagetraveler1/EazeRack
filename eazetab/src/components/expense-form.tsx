"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useData } from "@/lib/data-context";
import {
  PROJECT_STATUSES,
  type Project,
  type ProjectStatus,
} from "@/lib/types";
import { todayISO } from "@/lib/format";
import { saveReceipt } from "@/lib/receipt-store";
import { saveDraft } from "@/lib/draft-store";

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_RECEIPT_TYPES = ["image/", "application/pdf"];

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";
const CREATE_COMPANY_VALUE = "__create_company__";
const CREATE_PROJECT_VALUE = "__create_project__";

const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  completed: "Completed",
};

type ExpenseProjectOption = Pick<
  Project,
  "id" | "company_id" | "project_name" | "client_name"
>;

export function ExpenseForm({
  projects,
  defaultProjectId,
}: {
  projects: ExpenseProjectOption[];
  defaultProjectId?: string;
}) {
  const router = useRouter();
  const { addCompany, addProject, companies } = useData();
  const sortedCompanies = [...companies].sort((a, b) =>
    a.company_name.localeCompare(b.company_name)
  );
  const defaultProject = defaultProjectId
    ? projects.find((p) => p.id === defaultProjectId)
    : null;

  const [companyId, setCompanyId] = useState(defaultProject?.company_id ?? "");
  const [projectId, setProjectId] = useState(defaultProject?.id ?? "");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [companyModalOpen, setCompanyModalOpen] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyNotes, setNewCompanyNotes] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectClientName, setNewProjectClientName] = useState("");
  const [newProjectStatus, setNewProjectStatus] =
    useState<ProjectStatus>("active");
  const photoInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const filteredProjects = projects
    .filter((project) => project.company_id === companyId)
    .sort((a, b) => a.project_name.localeCompare(b.project_name));

  function openCompanyModal() {
    setNewCompanyName("");
    setNewCompanyNotes("");
    setCompanyModalOpen(true);
  }

  function openProjectModal() {
    setNewProjectName("");
    setNewProjectClientName("");
    setNewProjectStatus("active");
    setProjectModalOpen(true);
  }

  function handleCompanyChange(value: string) {
    if (value === CREATE_COMPANY_VALUE) {
      openCompanyModal();
      return;
    }

    setCompanyId(value);
    if (!projects.some((p) => p.id === projectId && p.company_id === value)) {
      setProjectId("");
    }
  }

  function handleProjectChange(value: string) {
    if (value === CREATE_PROJECT_VALUE) {
      openProjectModal();
      return;
    }
    setProjectId(value);
  }

  function handleCreateCompany(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const company = addCompany({
      company_name: newCompanyName.trim(),
      notes: newCompanyNotes.trim() || null,
    });
    setCompanyId(company.id);
    setProjectId("");
    setCompanyModalOpen(false);
  }

  function handleCreateProject(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const project = addProject({
      company_id: companyId,
      project_name: newProjectName.trim(),
      client_name: newProjectClientName.trim(),
      status: newProjectStatus,
    });
    setProjectId(project.id);
    setProjectModalOpen(false);
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setReceiptFile(null);
      return;
    }
    if (!projectId) {
      setError("Select a company and project before attaching a receipt.");
      e.target.value = "";
      setReceiptFile(null);
      return;
    }
    if (!ACCEPTED_RECEIPT_TYPES.some((t) => file.type.startsWith(t))) {
      setError("Receipts must be an image or a PDF.");
      e.target.value = "";
      setReceiptFile(null);
      return;
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      setError("Receipt files must be 10 MB or smaller.");
      e.target.value = "";
      setReceiptFile(null);
      return;
    }
    setReceiptFile(file);

    setSaving(true);
    try {
      const receiptUrl = await saveReceipt(file);
      saveDraft({
        project_id: projectId,
        vendor: "",
        expense_date: todayISO(),
        amount: 0,
        category: "Materials",
        custom_category: null,
        notes: null,
        receipt_url: receiptUrl,
        receipt_name: file.name,
        receipt_type: file.type,
      });
      router.push("/receipts/review");
    } catch {
      setError("Could not save the receipt file. Try again or remove it.");
      setSaving(false);
      setReceiptFile(null);
      e.target.value = "";
    }
  }

  return (
    <>
      <form className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label
              htmlFor="company"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Company
            </label>
            <select
              id="company"
              required
              value={companyId}
              onChange={(e) => handleCompanyChange(e.target.value)}
              className={inputClass}
            >
              <option value="" disabled>
                Select a company...
              </option>
              <option value={CREATE_COMPANY_VALUE}>+ Create New Company</option>
              {sortedCompanies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.company_name}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="project"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Project
            </label>
            <select
              id="project"
              required
              disabled={!companyId}
              value={projectId}
              onChange={(e) => handleProjectChange(e.target.value)}
              className={inputClass}
            >
              <option value="" disabled>
                {companyId
                  ? "Select a project..."
                  : "Select a company first..."}
              </option>
              {companyId && (
                <option value={CREATE_PROJECT_VALUE}>
                  + Create New Project
                </option>
              )}
              {filteredProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.project_name} — {project.client_name}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <p className="mb-1.5 block text-sm font-medium text-slate-700">
              Receipt
            </p>
            <input
              ref={photoInputRef}
              id="receipt-photo"
              type="file"
              accept="image/*"
              capture="environment"
              disabled={!projectId || saving}
              onChange={handleFileChange}
              className="hidden"
            />
            <input
              ref={uploadInputRef}
              id="receipt-upload"
              type="file"
              accept="image/*,application/pdf"
              disabled={!projectId || saving}
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={!projectId || saving}
                onClick={() => photoInputRef.current?.click()}
                className="flex min-h-14 items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Take Photo
              </button>
              <button
                type="button"
                disabled={!projectId || saving}
                onClick={() => uploadInputRef.current?.click()}
                className="flex min-h-14 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Upload File
              </button>
            </div>
            {receiptFile && (
              <div className="mt-2 flex items-center justify-between rounded-lg bg-emerald-50 px-3.5 py-2 text-sm">
                <span className="truncate text-emerald-800">
                  {receiptFile.name}{" "}
                  <span className="text-emerald-600">
                    ({(receiptFile.size / 1024).toFixed(0)} KB)
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => uploadInputRef.current?.click()}
                  disabled={saving}
                  className="ml-3 shrink-0 text-xs font-medium text-emerald-700 hover:underline"
                >
                  Change
                </button>
              </div>
            )}
            <p className="mt-1.5 text-xs text-slate-400">
              Select a receipt after choosing the company and project. Image
              and PDF receipts are scanned locally for vendor, date, total
              amount, and category suggestions.
            </p>
          </div>
        </div>

        {error && (
          <p className="mt-5 rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-400">
            {saving
              ? "Saving receipt and starting OCR review..."
              : "Vendor, date, amount, and category come next on the review screen."}
          </p>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </form>

      {companyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-slate-900/50"
            onClick={() => setCompanyModalOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl sm:p-8">
            <h2 className="text-lg font-semibold text-slate-900">
              New Company
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Create a company, then choose or create a project for this
              expense.
            </p>

            <form onSubmit={handleCreateCompany} className="mt-6 space-y-5">
              <div>
                <label
                  htmlFor="new_company_name"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Company Name
                </label>
                <input
                  id="new_company_name"
                  type="text"
                  required
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  placeholder="e.g. BuildCo Commercial"
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="new_company_notes"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Notes{" "}
                  <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <textarea
                  id="new_company_notes"
                  rows={3}
                  value={newCompanyNotes}
                  onChange={(e) => setNewCompanyNotes(e.target.value)}
                  placeholder="Anything worth remembering about this company..."
                  className={inputClass}
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCompanyModalOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
                >
                  Save Company
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {projectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-slate-900/50"
            onClick={() => setProjectModalOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl sm:p-8">
            <h2 className="text-lg font-semibold text-slate-900">
              New Project
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Create a project under the selected company and keep adding this
              expense.
            </p>

            <form onSubmit={handleCreateProject} className="mt-6 space-y-5">
              <div>
                <label
                  htmlFor="new_project_name"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Project Name
                </label>
                <input
                  id="new_project_name"
                  type="text"
                  required
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="e.g. Riverside Office Build-Out"
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="new_project_client_name"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Client Name
                </label>
                <input
                  id="new_project_client_name"
                  type="text"
                  required
                  value={newProjectClientName}
                  onChange={(e) => setNewProjectClientName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="new_project_status"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Status
                </label>
                <select
                  id="new_project_status"
                  value={newProjectStatus}
                  onChange={(e) =>
                    setNewProjectStatus(e.target.value as ProjectStatus)
                  }
                  className={inputClass}
                >
                  {PROJECT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setProjectModalOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
                >
                  Save Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
