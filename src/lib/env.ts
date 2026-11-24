export function getSupabaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!value) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is not set. Copy .env.example to .env.local and add your Supabase project URL.",
    )
  }
  return value
}

/**
 * Optional public origin for links in auth email. Null means "use the request
 * headers", which `resolveSiteUrl` handles (see src/lib/site-url.ts).
 */
export function getConfiguredSiteUrl(): string | null {
  const value = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  return value ? value : null
}

export function getSupabaseAnonKey(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!value) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. Copy .env.example to .env.local and add your anon/publishable key.",
    )
  }
  return value
}
