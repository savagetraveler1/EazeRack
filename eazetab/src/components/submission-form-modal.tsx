"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useData } from "@/lib/data-context";
import {
  SUBMISSION_STATUSES,
  type Project,
  type Submission,
  type SubmissionStatus,
} from "@/lib/types";
import { todayISO } from "@/lib/format";

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";

const STATUS_LABELS: Record<SubmissionStatus, string> = {
  Open: "Open",
  Closed: "Closed",
};

export function defaultSubmissionName(project: Pick<Project, "project_name">) {
  return `${todayISO()} - ${project.project_name}`;
}

export function SubmissionFormModal({
  project,
  trigger,
  triggerClassName,
  onCreated,
}: {
  project: Pick<Project, "id" | "project_name">;
  trigger: ReactNode;
  triggerClassName: string;
  onCreated?: (submission: Submission) => void;
}) {
  const { addSubmission } = useData();
  const [open, setOpen] = useState(false);
  const [submissionName, setSubmissionName] = useState(
    defaultSubmissionName(project)
  );
  const [submittedAt, setSubmittedAt] = useState(todayISO());
  const [status, setStatus] = useState<SubmissionStatus>("Open");
  const [notes, setNotes] = useState("");

  function openModal() {
    setSubmissionName(defaultSubmissionName(project));
    setSubmittedAt(todayISO());
    setStatus("Open");
    setNotes("");
    setOpen(true);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const submission = addSubmission({
      project_id: project.id,
      submission_name: submissionName.trim(),
      submitted_at: submittedAt,
      status,
      notes: notes.trim() || null,
    });
    onCreated?.(submission);
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
              New Submission
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Create a receipt batch under {project.project_name}.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <div>
                <label
                  htmlFor="submission_name"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Submission Name
                </label>
                <input
                  id="submission_name"
                  type="text"
                  required
                  value={submissionName}
                  onChange={(e) => setSubmissionName(e.target.value)}
                  placeholder="e.g. Expense BOM"
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="submitted_at"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Submitted At
                  </label>
                  <input
                    id="submitted_at"
                    type="date"
                    required
                    value={submittedAt}
                    onChange={(e) => setSubmittedAt(e.target.value)}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label
                    htmlFor="submission_status"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    Status
                  </label>
                  <select
                    id="submission_status"
                    value={status}
                    onChange={(e) =>
                      setStatus(e.target.value as SubmissionStatus)
                    }
                    className={inputClass}
                  >
                    {SUBMISSION_STATUSES.map((submissionStatus) => (
                      <option key={submissionStatus} value={submissionStatus}>
                        {STATUS_LABELS[submissionStatus]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="submission_notes"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Notes{" "}
                  <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <textarea
                  id="submission_notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything worth remembering about this batch..."
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
                  Create Submission
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
