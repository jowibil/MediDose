import Link from "next/link"
import { redirect } from "next/navigation"
import { Home, KeyRound, UserRound } from "lucide-react"

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

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>
}) {
  const context = await getSessionContext()
  if (!context) redirect("/login")

  // Only a linked patient has nothing left to do here. An unlinked one must be
  // able to reach this page, or the linking flow is unreachable.
  if (context.role === "patient" && context.patientState !== "not_linked") {
    redirect("/dashboard")
  }

  const wantsPatient =
    (await searchParams).as === "patient" && context.role !== "owner"
  const patientMode =
    context.role === "patient" ||
    context.accountType === "patient" ||
    wantsPatient

  if (patientMode) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <PageHeader
          title="Link your patient record"
          description="Enter the six-character code your household owner gave you."
          meta={<RoleBadge role="patient" />}
        />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound aria-hidden="true" className="size-4 text-sage-ink" />
              Patient link code
            </CardTitle>
            <CardDescription>
              The code works once and links this account to your own record.
              Codes are uppercase and never contain 0, O, 1, or I.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <JoinForm mode="patient" />
          </CardContent>
        </Card>

        <p className="text-xs leading-relaxed text-muted-foreground">
          You’ll see your own medicines and dose history. Your household owner
          manages the cabinet and can restore an archived record.
        </p>
      </div>
    )
  }

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
