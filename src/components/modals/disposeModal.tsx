import { type ReactNode } from "react"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

interface DeleteMedicineDialogProps {
  medicineName: string
  onConfirm: () => void
  /** Optional custom trigger. Defaults to a ghost button with a Trash icon. */
  trigger?: ReactNode
  /** Icon color override. Options: 'muted' | 'destructive'. Defaults to 'destructive'. */
  iconVariant?: "muted" | "destructive"
}

export function DeleteMedicineDialog({
  medicineName,
  onConfirm,
  trigger,
  iconVariant = "destructive",
}: DeleteMedicineDialogProps) {
  const iconColorClass =
    iconVariant === "muted" ? "text-muted-foreground" : "text-destructive"

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {trigger ?? (
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Remove ${medicineName}`}
          >
            <Trash2 className={`size-4 ${iconColorClass}`} />
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            Remove {medicineName} from the cabinet? This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            variant={"destructive"}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}