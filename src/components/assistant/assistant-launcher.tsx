"use client"

import { useState } from "react"
import { MessageCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { AssistantPanel } from "@/components/assistant/assistant-panel"
import type { Language } from "@/lib/language"

/**
 * Mounted by the app shell for every role. The panel is the only UI; the route
 * enforces scope, so hiding or showing this button is not a security boundary.
 */
export function AssistantLauncher({ language }: { language: Language }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="fixed right-4 bottom-4 z-40 h-11 rounded-full px-4 shadow-card print:hidden"
      >
        <MessageCircle aria-hidden="true" className="size-4" />
        Ask MediDose
      </Button>

      {open ? (
        <AssistantPanel language={language} onClose={() => setOpen(false)} />
      ) : null}
    </>
  )
}
