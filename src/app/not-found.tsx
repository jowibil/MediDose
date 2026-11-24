import Link from "next/link"
import { SearchX } from "lucide-react"

import { Button } from "@/components/ui/button"
import { MedicalDisclaimer } from "@/components/medical-disclaimer"

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center gap-5 px-4 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <SearchX aria-hidden="true" className="size-6" />
      </div>
      <div>
        <h1 className="font-display text-2xl font-medium">Page not found</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          That page doesn’t exist. Your medicines and schedule are still on the
          dashboard.
        </p>
      </div>
      <Button asChild>
        <Link href="/dashboard">Go to dashboard</Link>
      </Button>
      <MedicalDisclaimer className="mt-6 max-w-sm justify-center text-left text-muted-foreground" />
    </main>
  )
}
