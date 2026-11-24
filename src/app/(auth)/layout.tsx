import Image from "next/image"
import Link from "next/link"

import { MedicalDisclaimer } from "@/components/medical-disclaimer"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-[radial-gradient(120%_70%_at_50%_-10%,var(--sage-soft),transparent_65%)]">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-7 px-4 py-10">
        <Link
          href="/login"
          className="flex items-center gap-3 self-start rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
        >
          <Image
            src="/MediDoseLogosm.png"
            alt=""
            width={44}
            height={44}
            priority
            className="size-11 rounded-2xl object-contain"
          />
          <span>
            <span className="block font-display text-xl leading-none font-medium">
              MediDose
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              Precision Medicine, Trusted Care.
            </span>
          </span>
        </Link>

        {children}
      </main>

      <footer className="mx-auto w-full max-w-md px-4 pb-6 text-muted-foreground">
        <MedicalDisclaimer />
      </footer>
    </div>
  )
}
