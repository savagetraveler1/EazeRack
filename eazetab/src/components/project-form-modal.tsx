"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useData } from "@/lib/data-context";
import { PROJECT_STATUSES, type Project, type ProjectStatus } from "@/lib/types";

const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  completed: "Completed",
};

export function ProjectFormModal({
  project,
  trigger,
  triggerClassName,
}: {
  /** When provided, the modal edits this project; otherwise it creates one. */
  project?: Project;
  trigger: ReactNode;
  triggerClassName: string;
}) {
  const { addProject, updateProject } = useData();
  const isEdit = Boolean(project);

  const [open, setOpen] = useState(false);
  const [projectName, setProjectName] = useState(project?.project_name ?? "");
  const [clientName, setClientName] = useState(project?.client_name ?? "");
  const [status, setStatus] = useState<ProjectStatus>(
    project?.status ?? "active"
  );

  function openModal() {
    setProjectName(project?.project_name ?? "");
    setClientName(project?.client_name ?? "");
    setStatus(project?.status ?? "active");
    setOpen(true);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const values = {
      project_name: projectName.trim(),
      client_name: clientName.trim(),
      status,
    };

    if (isEdit) {
      updateProject(project!.id, values);
    } else {
      addProject(values);
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
              {isEdit ? "Edit Project" : "New Project"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {isEdit
                ? "Update the project details below."
                : "Start a new tab for a project."}
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <div>
                <label
                  htmlFor="project_name"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Project Name
                </label>
                <input
                  id="project_name"
                  type="text"
                  required
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. Riverside Office Build-Out"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div>
                <label
                  htmlFor="client_name"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Client Name
                </label>
                <input
                  id="client_name"
                  type="text"
                  required
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div>
                <label
                  htmlFor="status"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Status
                </label>
                <select
                  id="status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  {PROJECT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
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
                  {isEdit ? "Save Changes" : "Create Project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
