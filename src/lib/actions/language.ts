"use server"

import { cookies } from "next/headers"

import { LANGUAGE_COOKIE, isLanguage } from "@/lib/language"

/** Stores the assistant's answer language. Unknown values are ignored. */
export async function setLanguageAction(language: string): Promise<void> {
  if (!isLanguage(language)) return

  const cookieStore = await cookies()
  cookieStore.set(LANGUAGE_COOKIE, language, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  })
}
