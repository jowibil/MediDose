import Image from "next/image"
import Link from "next/link"

import { cn } from "@/lib/utils"

export function Brand({
  href = "/dashboard",
  compact = false,
}: {
  href?: string
  compact?: boolean
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Image
        src="/MediDoseLogosm.png"
        alt=""
        width={36}
        height={36}
        priority
        className="size-9 rounded-xl object-contain"
      />
      <span className="flex flex-col">
        <span className="font-display text-lg leading-none font-medium">
          MediDose
        </span>
        {compact ? null : (
          <span className="mt-0.5 hidden text-[11px] leading-none text-muted-foreground sm:block">
            Precision Medicine, Trusted Care.
          </span>
        )}
      </span>
    </Link>
  )
}

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display text-lg font-medium", className)}>
      MediDose
    </span>
  )
}
