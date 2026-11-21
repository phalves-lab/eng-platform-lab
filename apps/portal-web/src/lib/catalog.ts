import 'server-only'
import { ApiError } from '@/lib/api'

/** Turns a 503 from the catalog endpoints into null so the page can explain the outage. */
export const whenAvailable = <T>(promise: Promise<T>): Promise<T | null> =>
  promise.catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 503) return null
    throw error
  })
