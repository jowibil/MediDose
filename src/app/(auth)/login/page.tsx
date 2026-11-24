import Link from "next/link"

import { LoginForm } from "@/components/auth/login-form"

export const metadata = { title: "Sign in" }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const params = await searchParams
  return (
    <>
      <LoginForm next={params.next ?? "/dashboard"} initialError={params.error} />
      <p className="text-center text-xs text-muted-foreground">
        Managing medication for someone else?{" "}
        <Link
          href="/signup?role=caregiver"
          className="rounded font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Create a caregiver account
        </Link>
        .
      </p>
    </>
  )
}
