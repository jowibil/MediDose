/**
 * SMTP delivery for the auth emails built in `templates.ts`.
 *
 * Any SMTP provider works — Gmail with an app password
 * (`smtp.gmail.com:587`) is the zero-domain option, and Brevo/Mailtrap drop in
 * by changing the env vars once a domain is verified. The transport is created
 * per send and closed immediately: serverless invocations are short-lived, so a
 * pooled connection would only leak.
 */

import nodemailer from "nodemailer"

import type { RenderedEmail } from "@/lib/email/templates"

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string
  password: string
  from: string
  fromName: string
}

/** Returns null when the sender is not configured, so callers can fail loudly. */
export function readSmtpConfig(
  env: NodeJS.ProcessEnv = process.env,
): SmtpConfig | null {
  const user = env.SMTP_USER?.trim()
  const password = env.SMTP_PASSWORD
  if (!user || !password) return null

  const parsedPort = Number(env.SMTP_PORT ?? "587")
  const port =
    Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort < 65536
      ? parsedPort
      : 587

  return {
    host: env.SMTP_HOST?.trim() || "smtp.gmail.com",
    port,
    // 465 is implicit TLS; 587 upgrades with STARTTLS.
    secure: port === 465,
    user,
    password,
    from: env.EMAIL_FROM?.trim() || user,
    fromName: env.EMAIL_FROM_NAME?.trim() || "MediDose",
  }
}

export async function sendRenderedEmail(
  email: RenderedEmail,
  config: SmtpConfig,
): Promise<void> {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
  })

  try {
    await transport.sendMail({
      from: { name: config.fromName, address: config.from },
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    })
  } finally {
    transport.close()
  }
}
