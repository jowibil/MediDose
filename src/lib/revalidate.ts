import { revalidatePath } from "next/cache"

/**
 * The page paths that render medicine and dose data, grouped by how much a
 * mutation can affect. One table keeps every action invalidating the same
 * views in the same order.
 */
const VIEWS = {
  dose: ["/dashboard", "/medicines", "/history"],
  medicine: ["/dashboard", "/medicines", "/history", "/settings"],
  patient: ["/dashboard", "/medicines", "/history", "/settings", "/join"],
  summary: ["/summaries"],
} as const

export type RevalidateScope = keyof typeof VIEWS

export function revalidateViews(scope: RevalidateScope = "dose"): void {
  for (const path of VIEWS[scope]) revalidatePath(path)
}
