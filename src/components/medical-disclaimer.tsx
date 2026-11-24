import { Pill } from "lucide-react"

/**
 * Keep the medical disclaimer present but quiet: it belongs in the footer of
 * every signed-in and signed-out surface.
 */
export function MedicalDisclaimer({ className = "" }: { className?: string }) {
  return (
    <p className={`flex items-start gap-2 text-xs leading-relaxed ${className}`}>
      <Pill aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 opacity-70" />
      <span>
        MediDose is an organizational and inventory tool. It does not prescribe
        medication, diagnose conditions, or replace professional medical advice.
      </span>
    </p>
  )
}
