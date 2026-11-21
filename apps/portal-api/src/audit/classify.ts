import type { AuditKind } from '@lab/contracts'

export interface AuditedRequest {
  method: string
  route: string
  params: Record<string, unknown>
  query: Record<string, unknown>
  body: unknown
  login: string
}

export interface AuditPlan {
  action: string
  kind: AuditKind
  target: string | null
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const TARGET_FIELDS = ['project', 'team', 'login', 'conversationId'] as const
const MAX_TARGET = 200

/** Reads that expose data of other people or of the trail itself, recorded like a write. */
const isSensitiveRead = (request: AuditedRequest) => {
  if (request.route === '/api/team' || request.route.startsWith('/api/team/')) return true
  if (request.route === '/api/audit' || request.route.startsWith('/api/audit/')) return true
  const login = request.query['login']
  return request.route === '/api/me/review' && typeof login === 'string' && login !== request.login
}

const scalar = (value: unknown): string | null =>
  typeof value === 'string' || typeof value === 'number' ? String(value).trim() || null : null

const fieldsOf = (source: unknown): Record<string, unknown> =>
  typeof source === 'object' && source !== null && !Array.isArray(source)
    ? (source as Record<string, unknown>)
    : {}

const targetOf = (request: AuditedRequest): string | null => {
  const params = Object.entries(request.params)
    .map(([key, value]) => [key, scalar(value)] as const)
    .filter((entry): entry is readonly [string, string] => entry[1] !== null)
  const pairs = params.length
    ? params
    : TARGET_FIELDS.flatMap((field) => {
        const value = scalar(request.query[field]) ?? scalar(fieldsOf(request.body)[field])
        return value === null ? [] : [[field, value] as const]
      })
  const text = pairs.map(([key, value]) => `${key}=${value}`).join(', ')
  return text ? text.slice(0, MAX_TARGET) : null
}

/**
 * Decides whether a request enters the audit trail. Every write method is recorded, whatever the
 * controller; reads only when they reach team data (`/api/team/**`), another person's review
 * queue or the trail itself. Free text such as questions never becomes the target.
 */
export const classifyRequest = (request: AuditedRequest): AuditPlan | null => {
  const method = request.method.toUpperCase()
  const write = !SAFE_METHODS.has(method)
  if (!write && !isSensitiveRead(request)) return null
  return {
    action: `${method} ${request.route}`.slice(0, MAX_TARGET),
    kind: write ? 'write' : 'read',
    target: targetOf(request),
  }
}
