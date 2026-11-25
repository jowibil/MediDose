import { redirect } from "next/navigation"

import { getSessionContext, resolveActivePatient } from "@/lib/auth"
import { getTimeZone } from "@/lib/timezone"
import { getLanguage } from "@/lib/language-server"
import { AppShell } from "@/components/app-shell/app-shell"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const context = await getSessionContext()

  if (!context) {
    redirect("/login")
  }

  const [active, timeZone, language] = await Promise.all([
    resolveActivePatient(context),
    getTimeZone(),
    getLanguage(),
  ])

  return (
    <AppShell
      context={context}
      active={active}
      timeZone={timeZone}
      language={language}
    >
      {children}
    </AppShell>
  )
}
