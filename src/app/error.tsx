"use client"

import Link from "next/link"
import { TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { MedicalDisclaimer } from "@/components/medical-disclaimer"

export default function ErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col items-center justify-center gap-5 px-4 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-brick-soft text-brick-ink">
        <TriangleAlert aria-hidden="true" className="size-6" />
      </div>
      <div>
        <h1 className="font-display text-2xl font-medium">Something went wrong</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          We couldn’t load this page. Your saved medicines and history are
          unchanged. Try again, or head back to your dashboard.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </div>
      <MedicalDisclaimer className="mt-6 max-w-sm justify-center text-left text-muted-foreground" />
    </main>
  )
}
