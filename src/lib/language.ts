// Client-safe: no next/headers here, so the panel can import the option list.
// Reading the cookie lives in src/lib/language-server.ts.
export const LANGUAGE_COOKIE = "md_lang"

export type Language = "en" | "fil"

export const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "fil", label: "Filipino" },
]

export function isLanguage(value: string | undefined): value is Language {
  return value === "en" || value === "fil"
}

export function languageLabel(language: Language): string {
  return language === "fil" ? "Filipino" : "English"
}

