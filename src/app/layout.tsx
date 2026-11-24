import type { Metadata, Viewport } from "next"
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google"

import "./globals.css"

const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-fraunces",
})

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-plex-sans",
  weight: ["400", "500", "600"],
})

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-plex-mono",
  weight: ["400", "500", "600"],
})

export const metadata: Metadata = {
  title: {
    default: "MediDose — Precision Medicine, Trusted Care.",
    template: "%s · MediDose",
  },
  description:
    "Track medication schedules, stock, expiration dates, and caregiver access for your household.",
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#edf0ea" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1614" },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable}`}
    >
      <body className="min-h-[100dvh] antialiased">{children}</body>
    </html>
  )
}
