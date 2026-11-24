import { PageSkeleton } from "@/components/skeletons"

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6">
      <PageSkeleton rows={3} />
    </div>
  )
}
