/**
 * A small OpenAI-shaped wrapper. The provider stays swappable through
 * AI_API_BASE, and nothing here reads the environment at module scope: a
 * missing key must degrade one feature, not take down every route that
 * transitively imports this file.
 */
export class AiError extends Error {
  readonly kind: "unconfigured" | "request" | "response"

  constructor(message: string, kind: "unconfigured" | "request" | "response") {
    super(message)
    this.name = "AiError"
    this.kind = kind
  }
}

export const AI_NOT_CONFIGURED =
  "AI is not configured on this deployment. Add AI_API_KEY and AI_API_BASE, then redeploy."

export function isAiConfigured(): boolean {
  return Boolean(process.env.AI_API_KEY?.trim())
}

function modelName(): string {
  return process.env.AI_MODEL?.trim() || "gpt-4o-mini"
}

async function chat({
  system,
  user,
  json,
  timeoutMs,
}: {
  system: string
  user: string
  json: boolean
  timeoutMs: number
}): Promise<{ content: string; model: string }> {
  const apiKey = process.env.AI_API_KEY?.trim()
  if (!apiKey) throw new AiError(AI_NOT_CONFIGURED, "unconfigured")

  const base = (
    process.env.AI_API_BASE?.trim() || "https://api.openai.com/v1"
  ).replace(/\/+$/, "")
  const model = modelName()

  let response: Response
  try {
    response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: json ? 0.2 : 0.3,
        ...(json ? { response_format: { type: "json_object" } } : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    throw new AiError("The AI service did not respond in time.", "request")
  }

  if (!response.ok) {
    throw new AiError(
      `The AI service rejected the request (${response.status}).`,
      "request",
    )
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new AiError("The AI service returned an unreadable answer.", "response")
  }

  const content = extractContent(payload)
  if (!content) {
    throw new AiError("The AI service returned an empty answer.", "response")
  }

  return { content, model }
}

export interface JsonCompletion {
  data: Record<string, unknown>
  model: string
}

/**
 * One JSON-mode completion. The caller owns the shape of `data`; this function
 * only guarantees that the answer is an object and that failures are typed.
 */
export async function completeJson({
  system,
  user,
  timeoutMs = 25_000,
}: {
  system: string
  user: string
  timeoutMs?: number
}): Promise<JsonCompletion> {
  const { content, model } = await chat({ system, user, json: true, timeoutMs })

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new AiError("The AI service returned an unreadable answer.", "response")
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new AiError("The AI service returned an unexpected shape.", "response")
  }

  return { data: parsed as Record<string, unknown>, model }
}

/** One plain-text completion, used by the assistant. */
export async function completeText({
  system,
  user,
  timeoutMs = 25_000,
}: {
  system: string
  user: string
  timeoutMs?: number
}): Promise<string> {
  const { content } = await chat({ system, user, json: false, timeoutMs })
  return content.trim()
}

function extractContent(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null
  const choices = (payload as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) return null
  const message = (choices[0] as { message?: { content?: unknown } }).message
  const content = message?.content
  return typeof content === "string" && content.trim() ? content : null
}

/** Reads a string field from a completion, trimmed, or null. */
export function completionText(
  data: Record<string, unknown>,
  key: string,
): string | null {
  const value = data[key]
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}
