import { SignupForm } from "@/components/auth/signup-form"

export const metadata = { title: "Create account" }

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>
}) {
  const params = await searchParams
  const initialRole =
    params.role === "caregiver" || params.role === "patient"
      ? params.role
      : "owner"
  return <SignupForm initialRole={initialRole} />
}
