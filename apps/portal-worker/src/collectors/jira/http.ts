import type { ZodType } from 'zod'
import { withoutTrailingSlashes } from './source.js'

export const SEARCH_PATH = '/rest/api/3/search/jql'

const RETRYABLE = new Set([429, 503])
const MAX_WAIT_MS = 60_000

export interface JiraHttpOptions {
  site: string
  email: string
  apiToken: string
  fetch?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  maxRetries?: number
}

/**
 * Read-only Jira client: it only exposes GET and the JQL search, which Jira serves as POST but
 * never writes. There is no way to send any other method through it.
 */
export interface JiraHttp {
  get: <T>(path: string, query: Record<string, string | number>, schema: ZodType<T>) => Promise<T>
  search: <T>(body: Record<string, unknown>, schema: ZodType<T>) => Promise<T>
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Seconds or an HTTP date, as allowed by RFC 9110; falls back to exponential backoff. */
export const retryDelayMs = (header: string | null, attempt: number, now = Date.now()): number => {
  const backoff = 1000 * 2 ** attempt
  if (!header) return Math.min(backoff, MAX_WAIT_MS)
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_WAIT_MS)
  const date = Date.parse(header)
  if (Number.isNaN(date)) return Math.min(backoff, MAX_WAIT_MS)
  return Math.min(Math.max(date - now, 0), MAX_WAIT_MS)
}

export const createJiraHttp = (options: JiraHttpOptions): JiraHttp => {
  const doFetch = options.fetch ?? fetch
  const sleep = options.sleep ?? defaultSleep
  const maxRetries = options.maxRetries ?? 3
  const site = withoutTrailingSlashes(options.site)
  const credentials = Buffer.from(`${options.email}:${options.apiToken}`).toString('base64')
  const authorization = `Basic ${credentials}`

  const send = async <T>(
    method: 'GET' | 'POST',
    url: string,
    schema: ZodType<T>,
    body?: string,
  ): Promise<T> => {
    for (let attempt = 0; ; attempt += 1) {
      const response = await doFetch(url, {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: authorization,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body } : {}),
      })
      if (response.ok) return schema.parse(await response.json())
      if (!RETRYABLE.has(response.status) || attempt >= maxRetries) {
        throw new Error(`Jira answered ${response.status} on ${method} ${new URL(url).pathname}`)
      }
      await sleep(retryDelayMs(response.headers.get('retry-after'), attempt))
    }
  }

  return {
    get: (path, query, schema) => {
      const url = new URL(`${site}${path}`)
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value))
      return send('GET', url.toString(), schema)
    },
    search: (body, schema) => send('POST', `${site}${SEARCH_PATH}`, schema, JSON.stringify(body)),
  }
}
