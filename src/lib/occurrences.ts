import type {
  DoseLogStatus,
  DoseOccurrence,
  SkipReason,
} from "@/types/medicine"
import { occurrenceKey } from "@/lib/schedule"

export interface DoseLogRow {
  id: string
  medicine_id: string
  patient_id: string
  scheduled_date: string
  scheduled_time: string
  status: DoseLogStatus
  skip_reason: SkipReason | null
  skip_note: string | null
  logged_by: string | null
  logged_at: string
  last_modified_by: string | null
  updated_at: string
}

/** Attaches persisted Taken/Skipped logs to derived Pending occurrences. */
export function mergeOccurrences(
  occurrences: DoseOccurrence[],
  logs: DoseLogRow[],
  nameById: Map<string, string>,
): DoseOccurrence[] {
  const logByKey = new Map(
    logs.map((log) => [
      occurrenceKey(log.medicine_id, log.scheduled_date, log.scheduled_time),
      log,
    ]),
  )

  return occurrences.map((occurrence) => {
    const log = logByKey.get(
      occurrenceKey(
        occurrence.medicineId,
        occurrence.scheduledDate,
        occurrence.scheduledTime,
      ),
    )
    if (!log) return occurrence

    return {
      ...occurrence,
      status: log.status,
      logId: log.id,
      skipReason: log.skip_reason ?? undefined,
      skipNote: log.skip_note ?? undefined,
      loggedByName: log.logged_by
        ? nameById.get(log.logged_by)
        : undefined,
      loggedAt: log.logged_at,
      lastModifiedByName: log.last_modified_by
        ? nameById.get(log.last_modified_by)
        : undefined,
    }
  })
}

/** Groups occurrences by their "HH:MM" slot, ordered chronologically. */
export function groupByTime(
  occurrences: DoseOccurrence[],
): [string, DoseOccurrence[]][] {
  const map = new Map<string, DoseOccurrence[]>()
  for (const occurrence of occurrences) {
    const list = map.get(occurrence.scheduledTime)
    if (list) list.push(occurrence)
    else map.set(occurrence.scheduledTime, [occurrence])
  }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
}

/** Sort newest occurrence first (date, then time). */
export function sortOccurrencesDesc(
  occurrences: DoseOccurrence[],
): DoseOccurrence[] {
  return [...occurrences].sort((a, b) =>
    `${b.scheduledDate} ${b.scheduledTime}`.localeCompare(
      `${a.scheduledDate} ${a.scheduledTime}`,
    ),
  )
}

