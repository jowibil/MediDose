import { LoginForm } from "@/components/auth/login-form"

export const metadata = { title: "Sign in" }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const params = await searchParams
  return (
    <LoginForm next={params.next ?? "/dashboard"} initialError={params.error} />
  )
}
