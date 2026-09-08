import type { Medicine } from "@/types/medicine"

export const LOW_STOCK_THRESHOLD = 5

export function isOutOfStock(medicine: Medicine): boolean {
  return medicine.stock <= 0
}

export function isLowStock(medicine: Medicine): boolean {
  return medicine.stock > 0 && medicine.stock <= LOW_STOCK_THRESHOLD
}
