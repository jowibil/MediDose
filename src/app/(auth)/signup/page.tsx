import { SignupForm } from "@/components/auth/signup-form"

export const metadata = { title: "Create account" }

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>
}) {
  const params = await searchParams
  return (
    <SignupForm
      initialRole={params.role === "caregiver" ? "caregiver" : "owner"}
    />
  )
}
