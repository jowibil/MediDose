import { cookies } from "next/headers"

import { LANGUAGE_COOKIE, isLanguage, type Language } from "@/lib/language"

/**
 * The language the assistant answers in. It is a cookie, not a setting: no
 * table, no migration, no per-user row — the scope asked for a bilingual
 * answer, not a localised app.
 */
export async function getLanguage(): Promise<Language> {
  const cookieStore = await cookies()
  const value = cookieStore.get(LANGUAGE_COOKIE)?.value
  return isLanguage(value) ? value : "en"
}
