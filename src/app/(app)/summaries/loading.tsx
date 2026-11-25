export default function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="h-9 w-56 animate-pulse rounded-xl bg-muted" />
      <div className="h-16 animate-pulse rounded-2xl bg-muted" />
      <div className="h-44 animate-pulse rounded-2xl bg-muted" />
      <div className="h-44 animate-pulse rounded-2xl bg-muted" />
      <span className="sr-only">Loading weekly summaries…</span>
    </div>
  )
}
