export const toIso = (value: Date): string => value.toISOString()

export const toIsoOrNull = (value: Date | null): string | null =>
  value === null ? null : value.toISOString()
