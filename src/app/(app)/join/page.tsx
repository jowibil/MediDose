import Link from "next/link"
import { redirect } from "next/navigation"
import { Home, KeyRound } from "lucide-react"

import { getSessionContext } from "@/lib/auth"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { JoinForm } from "@/components/join-form"
import { RoleBadge } from "@/components/app-shell/role-badge"

export const metadata = { title: "Join a household" }

export default async function JoinPage() {
  const context = await getSessionContext()
  if (!context) redirect("/login")

  if (context.role === "owner") {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <PageHeader
          title="Join a household"
          meta={<RoleBadge role="owner" />}
        />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Home aria-hidden="true" className="size-4 text-sage-ink" />
              This account manages its own household
            </CardTitle>
            <CardDescription>
              Owners can’t join another household — roles are fixed at signup.
              Invite caregivers from Settings and share the six-character code
              with them instead.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/settings">Open settings</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <PageHeader
        title="Join a household"
        description="Enter the six-character code the owner shared with you."
        meta={<RoleBadge role="caregiver" />}
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound aria-hidden="true" className="size-4 text-amber-ink" />
            Household invite code
          </CardTitle>
          <CardDescription>
            Codes are uppercase and never contain 0, O, 1, or I. Five failed
            attempts per hour are allowed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <JoinForm />
        </CardContent>
      </Card>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Joining adds that household’s patients to your patient switcher. You keep
        access to any household you already help with.
      </p>
    </div>
  )
}
