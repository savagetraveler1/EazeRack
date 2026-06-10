/** Shown while the local data store hydrates from localStorage. */
export function PageSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-7 w-48 rounded-lg bg-slate-200" />
      <div className="mt-2 h-4 w-72 rounded bg-slate-100" />
      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <div className="h-32 rounded-2xl bg-slate-100" />
        <div className="h-32 rounded-2xl bg-slate-100" />
        <div className="h-32 rounded-2xl bg-slate-100" />
      </div>
      <div className="mt-10 h-64 rounded-2xl bg-slate-100" />
    </div>
  );
}
