import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))

/** Groups items by key, keeping first-seen key order. */
export const groupBy = <T, K>(items: T[], keyOf: (item: T) => K): Map<K, T[]> => {
  const groups = new Map<K, T[]>()
  for (const item of items) {
    const key = keyOf(item)
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return groups
}
