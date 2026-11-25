"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Send, Sparkles, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { setLanguageAction } from "@/lib/actions/language"
import { LANGUAGE_OPTIONS, type Language } from "@/lib/language"
import { MAX_ASSISTANT_QUESTION_LENGTH } from "@/lib/validation"
import { cn } from "@/lib/utils"

interface ChatMessage {
  id: number
  role: "user" | "assistant"
  text: string
}

const FALLBACK_ERROR = "The assistant couldn’t answer. Please try again."

/**
 * Turns sent back with a question. The route caps this again (and clips each
 * turn), so the number here only keeps the request small.
 */
const HISTORY_TURNS = 8

export function AssistantPanel({
  language,
  onClose,
}: {
  language: Language
  onClose: () => void
}) {
  const router = useRouter()
  const [draft, setDraft] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isAsking, setIsAsking] = useState(false)
  const [isSwitching, startLanguage] = useTransition()
  const threadRef = useRef<HTMLDivElement | null>(null)
  const nextId = useRef(0)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  // New questions and answers appear at the bottom, like any chat.
  useEffect(() => {
    const thread = threadRef.current
    if (thread) thread.scrollTop = thread.scrollHeight
  }, [messages, error, isAsking])

  async function ask() {
    const question = draft.trim()
    if (isAsking || !question) return

    // Only the last few turns travel with the question; the server clips them
    // again and never trusts their shape.
    const history = messages.slice(-HISTORY_TURNS).map((message) => ({
      role: message.role,
      content: message.text,
    }))

    setMessages((current) => [
      ...current,
      { id: nextId.current++, role: "user", text: question },
    ])
    setDraft("")
    setError(null)
    setIsAsking(true)

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, history }),
      })
      const payload = (await response.json().catch(() => null)) as {
        answer?: string
        error?: string
      } | null

      if (!response.ok) {
        setError(payload?.error ?? FALLBACK_ERROR)
        return
      }
      if (!payload?.answer) {
        setError(FALLBACK_ERROR)
        return
      }
      setMessages((current) => [
        ...current,
        { id: nextId.current++, role: "assistant", text: payload.answer ?? "" },
      ])
    } catch {
      setError("The assistant couldn’t answer. Check your connection.")
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
        className="flex h-[min(85dvh,40rem)] w-full max-w-lg flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-card"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2
              id="assistant-heading"
              className="flex items-center gap-2 font-display text-lg"
            >
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

        <div
          className="flex items-center gap-1"
          role="group"
          aria-label="Answer language"
        >
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

        <div
          ref={threadRef}
          aria-live="polite"
          className="flex-1 space-y-3 overflow-y-auto pr-1"
        >
          {messages.length === 0 && !isAsking && !error ? (
            <div className="rounded-xl border border-border/70 bg-muted/30 p-3 text-sm leading-relaxed text-muted-foreground">
              Ask about schedules, stock, or recent doses. If the record does not
              hold the answer, the assistant will say so.
            </div>
          ) : null}

          {messages.map((message) =>
            message.role === "user" ? (
              <div
                key={message.id}
                className="ml-auto w-fit max-w-[85%] rounded-2xl bg-primary px-3 py-2 text-sm leading-relaxed whitespace-pre-line text-primary-foreground"
              >
                {message.text}
              </div>
            ) : (
              <div
                key={message.id}
                className="w-fit max-w-[88%] rounded-2xl bg-muted px-3 py-2 text-sm leading-relaxed whitespace-pre-line"
              >
                {message.text}
              </div>
            ),
          )}

          {isAsking ? (
            <div className="w-fit max-w-[88%] rounded-2xl bg-muted px-3 py-2 text-sm text-muted-foreground">
              Reading the record…
            </div>
          ) : null}

          {error ? (
            <p
              role="alert"
              className="rounded-xl border border-border bg-card px-3 py-2 text-xs text-destructive"
            >
              {error}
            </p>
          ) : null}
        </div>

        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void ask()
          }}
        >
          <Textarea
            autoFocus
            value={draft}
            rows={1}
            maxLength={MAX_ASSISTANT_QUESTION_LENGTH}
            placeholder="Type your question…"
            aria-label="Your question"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                void ask()
              }
            }}
            className="max-h-32 min-h-9 resize-none py-2"
          />
          <Button
            type="submit"
            size="sm"
            disabled={isAsking || !draft.trim()}
            className="h-9 shrink-0"
          >
            <Send aria-hidden="true" className="size-4" />
            <span className="sr-only">Ask</span>
          </Button>
        </form>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Not medical advice, and it never suggests a dose change — speak to a
          clinician or pharmacist for that. Your question and this patient’s
          medicine names are sent to the AI provider; no email or account id is.
        </p>
      </div>
    </div>
  )
}
