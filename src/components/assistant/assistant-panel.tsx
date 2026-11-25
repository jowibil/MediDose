"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Send, Sparkles, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { setLanguageAction } from "@/lib/actions/language"
import { LANGUAGE_OPTIONS, type Language } from "@/lib/language"
import { MAX_ASSISTANT_QUESTION_LENGTH } from "@/lib/validation"
import { cn } from "@/lib/utils"

export function AssistantPanel({
  language,
  onClose,
}: {
  language: Language
  onClose: () => void
}) {
  const router = useRouter()
  const [question, setQuestion] = useState("")
  const [answer, setAnswer] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isAsking, setIsAsking] = useState(false)
  const [isSwitching, startLanguage] = useTransition()

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  async function ask(event: React.FormEvent) {
    event.preventDefault()
    if (isAsking || !question.trim()) return

    setError(null)
    setAnswer(null)
    setIsAsking(true)
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
      })
      const payload = (await response.json().catch(() => null)) as {
        answer?: string
        error?: string
      } | null

      if (!response.ok) {
        setError(payload?.error ?? "The assistant could not answer.")
        return
      }
      setAnswer(payload?.answer ?? null)
    } catch {
      setError("The assistant could not answer. Check your connection.")
    } finally {
      setIsAsking(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-end bg-foreground/20 p-4 sm:items-center sm:justify-center"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="assistant-heading"
        className="flex max-h-[85dvh] w-full max-w-md flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-card"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 id="assistant-heading" className="flex items-center gap-2 font-display text-lg">
              <Sparkles aria-hidden="true" className="size-4 text-sage-ink" />
              Ask MediDose
            </h2>
            <p className="text-xs text-muted-foreground">
              Answers come from this patient’s record only.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onClose}
            aria-label="Close assistant"
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1" role="group" aria-label="Answer language">
          {LANGUAGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={language === option.value}
              disabled={isSwitching}
              onClick={() =>
                startLanguage(async () => {
                  await setLanguageAction(option.value)
                  router.refresh()
                })
              }
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                language === option.value
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <form className="flex items-center gap-2" onSubmit={ask}>
          <Input
            autoFocus
            value={question}
            maxLength={MAX_ASSISTANT_QUESTION_LENGTH}
            placeholder="e.g. What is due tonight?"
            onChange={(event) => setQuestion(event.target.value)}
            aria-label="Your question"
          />
          <Button
            type="submit"
            size="sm"
            disabled={isAsking || !question.trim()}
            className="h-9"
          >
            <Send aria-hidden="true" className="size-4" />
            <span className="sr-only">Ask</span>
          </Button>
        </form>

        <div className="min-h-12 overflow-y-auto rounded-xl border border-border/70 bg-muted/30 p-3 text-sm leading-relaxed">
          {isAsking ? (
            <p className="text-muted-foreground">Reading the record…</p>
          ) : error ? (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          ) : answer ? (
            <p className="whitespace-pre-line">{answer}</p>
          ) : (
            <p className="text-muted-foreground">
              Ask about schedules, stock, or recent doses. If the record does not
              hold the answer, the assistant will say so.
            </p>
          )}
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Not medical advice, and it never suggests a dose change — speak to a
          clinician or pharmacist for that. Your question and this patient’s
          medicine names are sent to the AI provider; no email or account id is.
        </p>
      </div>
    </div>
  )
}
