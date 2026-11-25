"use client"

import { createContext, useContext } from "react"

export interface DisposedNotice {
  medicineId: string
  medicineName: string
  discarded: number
}

export interface DisposeUndoApi {
  announce: (notice: DisposedNotice) => void
}

export const DisposeUndoContext = createContext<DisposeUndoApi | null>(null)

export function useDisposeUndo(): DisposeUndoApi {
  const api = useContext(DisposeUndoContext)
  if (!api) {
    throw new Error("useDisposeUndo must be used inside DisposeUndoProvider")
  }
  return api
}
