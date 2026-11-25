/**
 * Deterministic guardrails around the assistant route.
 *
 * The prompt already forbids diagnosis and dose changes, but a prompt is a
 * request, not an enforcement. These checks are the enforcement: what may be
 * asked, who may ask it from where, and what may be returned. They are pure so
 * the rules can be tested without a network or a database.
 */

import type { ChatTurn } from "@/lib/ai/client"

/**
 * Hard cap on the JSON body, checked before parsing. A conversation carries a
 * short history, so the cap is larger than one question but still tiny.
 */
export const MAX_REQUEST_BYTES = 16_384

/** Earlier turns accepted from the client. Only the tail is kept. */
export const MAX_HISTORY_TURNS = 8

/** Each retained turn is cut to this length before it reaches the model. */
export const MAX_HISTORY_CHARS = 300

/** The longest answer shown to a person. Longer answers are cut at a sentence. */
export const MAX_ANSWER_CHARS = 1_400

export const SAFE_ANSWER =
  "I can’t advise on changing doses, starting or stopping a medicine, or what a symptom means. Please speak to a clinician or pharmacist, and keep following the schedule as prescribed."

/**
 * Questions that try to move the model out of its role. The record is data and
 * the question is data, but a person can still type "ignore your instructions".
 * Refusing here costs one call and cannot be prompt-engineered around.
 */
const INJECTION_PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget)\s+(all\s+)?(your\s+|the\s+)?(previous|prior|above|earlier)\s+(instructions|rules|prompt)\b/i,
  /\b(system|developer)\s+(prompt|message|instructions)\b/i,
  /\byour\s+(instructions|rules|system\s+prompt)\b/i,
  /\b(jailbreak|developer\s+mode|act\s+as\s+(a\s+)?(doctor|physician|pharmacist))\b/i,
]

export const SCOPE_ANSWER =
  "I only answer questions about this MediDose record — schedules, stock, doses, and history."

/**
 * Clearly unrelated domains. A hit alone is not enough to refuse (a question
 * can mention the weather *and* a medicine); it only refuses when the question
 * also contains none of the MediDose vocabulary below.
 */
const OFF_TOPIC_PATTERNS: RegExp[] = [
  /\b(weather|forecast|rain(ing)?|temperatures?)\b/i,
  /\b(news|headlines?|stock market|crypto|bitcoin|election)\b/i,
  /\b(who won|score|match|tournament|football|basketball|soccer)\b/i,
  /\b(write|debug|fix|explain)\b[^.?!]{0,30}\b(code|script|function|program|regex)\b/i,
  /\b(homework|essay|poem|joke|recipe|translate|summarise this article)\b/i,
  /\b(capital of|president of|population of)\b/i,
]

/** Everything the assistant is allowed to be asked about. */
const MEDIDOSE_VOCABULARY: RegExp[] = [
  /\b(dose|doses|dosage|medicine|medicines|medication|prescription|pill|tablet|capsule|syrup)\b/i,
  /\b(stock|refill|restock|supply|supplies|expire|expires|expiring|expiry|expiration)\b/i,
  /\b(schedule|scheduled|taken|skipped|skip|adherence|history|log|logged|due|missed)\b/i,
  /\b(patient|cabinet|pharmacy|caregiver|household|medidose)\b/i,
]

/**
 * Statements that would be medical advice. The assistant is allowed to say
 * "ask a clinician"; it is not allowed to tell someone to change a dose.
 */
const UNSAFE_ADVICE_PATTERNS: RegExp[] = [
  /\b(increase|reduce|decrease|double|halve|lower)\s+(your|the)\s+(dose|dosage)\b/i,
  /\b(stop|start)\s+taking\s+(your|the|this)\s+\w+/i,
  // `take` is deliberately absent: "you should take it with food" is harmless
  // adherence advice, and refusing it made the assistant look broken. Changing,
  // stopping, or skipping a prescribed medicine is the line.
  /\byou\s+(should|must|need\s+to)\s+(stop|start|change|skip|increase|reduce)\b/i,
  /\byou\s+(should|must|need\s+to)\s+(take|use)\s+(two|three|four|double|more|less|half|another)\b/i,
  /\byou\s+(likely\s+|probably\s+)?have\s+(an?\s+)?(infection|condition|disease|disorder|overdose)\b/i,
  /\bit('s|\s+is)\s+(safe|fine)\s+to\s+(take|stop|skip|double)\b/i,
]

/** Collapses whitespace and drops control characters before anything else. */
export function normalizeQuestion(raw: string): string {
  // Filtered by code point rather than a control-character regex: the range is
  // explicit here, and a regex literal trips no-control-regex for a good reason.
  let cleaned = ""
  for (const character of raw) {
    const code = character.codePointAt(0) ?? 0
    cleaned += code < 0x20 || code === 0x7f ? " " : character
  }
  return cleaned.replace(/\s+/g, " ").trim()
}

/**
 * Earlier turns are conversation, not credentials: each is normalised, clipped,
 * and limited to the recognised roles. Anything else is dropped, and the caller
 * only ever sends the tail, so a long or malformed thread cannot grow the
 * request or outweigh the current question.
 */
export function screenHistory(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return []

  const turns: ChatTurn[] = []
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue
    const { role, content } = item as { role?: unknown; content?: unknown }
    if (role !== "user" && role !== "assistant") continue
    if (typeof content !== "string") continue
    const normalized = normalizeQuestion(content).slice(0, MAX_HISTORY_CHARS)
    if (!normalized) continue
    turns.push({ role, content: normalized })
  }

  return turns.slice(-MAX_HISTORY_TURNS)
}

export type QuestionScreen = { allowed: true } | { allowed: false; reason: string }

export function screenQuestion(question: string): QuestionScreen {
  if (INJECTION_PATTERNS.some((pattern) => pattern.test(question))) {
    return {
      allowed: false,
      reason:
        "I can only answer questions about the medication record. Ask about schedules, stock, or recent doses.",
    }
  }

  // Off-topic is only refused when nothing in the question is about MediDose,
  // so "is it safe to take this in hot weather?" still reaches the model (which
  // answers from the record or says it cannot).
  const offTopic = OFF_TOPIC_PATTERNS.some((pattern) => pattern.test(question))
  const onTopic = MEDIDOSE_VOCABULARY.some((pattern) => pattern.test(question))
  if (offTopic && !onTopic) {
    return { allowed: false, reason: SCOPE_ANSWER }
  }

  return { allowed: true }
}

/**
 * Last line of defence on the way out: replace advice the assistant must never
 * give, and keep the answer to a readable length. Returns the text to show.
 */
export function screenAnswer(answer: string): string {
  const trimmed = answer.trim()
  if (!trimmed) return SAFE_ANSWER

  if (UNSAFE_ADVICE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return SAFE_ANSWER
  }

  if (trimmed.length <= MAX_ANSWER_CHARS) return trimmed

  const cut = trimmed.slice(0, MAX_ANSWER_CHARS)
  const lastSentence = Math.max(
    cut.lastIndexOf(". "),
    cut.lastIndexOf("? "),
    cut.lastIndexOf("! "),
  )
  return lastSentence > 200 ? cut.slice(0, lastSentence + 1) : `${cut.trim()}…`
}

/**
 * Only this origin may POST. The session cookie is SameSite=lax, which already
 * blocks cross-site form posts; this is the explicit check on top, and it also
 * refuses a request that arrives with a foreign Origin header.
 *
 * A request with no Origin (server-to-server, curl) is allowed through and then
 * has to pass the session check — the cookie, not the header, is the credential.
 */
export function isSameOriginRequest(headers: Headers): boolean {
  const site = headers.get("sec-fetch-site")
  if (site && site !== "same-origin" && site !== "none") return false

  const origin = headers.get("origin")
  if (!origin) return true

  const host = headers.get("host")
  if (!host) return false

  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}
