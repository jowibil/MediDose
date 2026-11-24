import Link from "next/link"

import type { ActivePatient } from "@/lib/auth"
import type { SessionContext } from "@/types/medicine"
import { NavLinks } from "@/components/app-shell/nav-links"
import { Brand } from "@/components/app-shell/brand"
import { PatientSelector } from "@/components/app-shell/patient-selector"
import { RoleBadge } from "@/components/app-shell/role-badge"
import { TimezoneSync } from "@/components/app-shell/timezone-sync"
import { UserMenu } from "@/components/app-shell/user-menu"
import { MedicalDisclaimer } from "@/components/medical-disclaimer"

export function AppShell({
  context,
  active,
  timeZone,
  children,
}: {
  context: SessionContext
  active: ActivePatient | null
  timeZone: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur-md">
        <div className="mx-auto w-full max-w-5xl px-4 md:px-6">
          <div className="flex h-16 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Brand />
              <RoleBadge role={context.role} className="hidden sm:inline-flex" />
            </div>

            <div className="flex min-w-0 items-center justify-end gap-2">
              <div className="min-w-0 flex-1 sm:flex-none">
                <PatientSelector groups={context.households} active={active} />
              </div>
              <UserMenu
                displayName={context.displayName}
                email={context.email}
                role={context.role}
              />
            </div>
          </div>

          <div className="flex items-end justify-between gap-3">
            <NavLinks role={context.role} />
            <div className="pb-2">
              <TimezoneSync current={timeZone} />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-6 md:py-10">
        {children}
      </main>

      <footer className="mt-auto border-t border-border/70">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-6 text-muted-foreground md:px-6">
          <MedicalDisclaimer />
          <p className="text-[11px]">
            <Link
              href="/dashboard"
              className="rounded font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              MediDose
            </Link>{" "}
            keeps schedules, stock, and dose history for one household.
          </p>
        </div>
      </footer>
    </div>
  )
}
