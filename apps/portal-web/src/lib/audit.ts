import type { AuditKind, AuditOutcome, AuditQuery } from '@lab/contracts'
import type { BadgeTone } from '@/lib/labels'

export const AUDIT_PATH = '/admin/auditoria'

const ACTION_LABEL: Record<string, string> = {
  'POST /api/releases/plan': 'Planejar release',
  'POST /api/releases/execute': 'Gerar release',
  'POST /api/releases/publish/plan': 'Planejar publicação',
  'POST /api/releases/publish/execute': 'Publicar release',
  'DELETE /api/conversations/:id': 'Apagar conversa',
  'POST /api/ask': 'Perguntar ao handbook',
  'POST /api/ask/stream': 'Perguntar ao handbook',
  'GET /api/me/review': 'Ver a fila de outra pessoa',
  'GET /api/team/work': 'Ver a carga do time',
  'GET /api/audit': 'Consultar a auditoria',
}

/** Readable name of an audited action; unknown routes show as they were recorded. */
export const actionLabel = (action: string) => ACTION_LABEL[action] ?? action

export const AUDIT_KINDS: readonly AuditKind[] = ['write', 'read']
export const KIND_LABEL: Record<AuditKind, string> = { write: 'Escrita', read: 'Leitura de time' }

export const AUDIT_OUTCOMES: readonly AuditOutcome[] = ['success', 'denied', 'failed']
export const OUTCOME_LABEL: Record<AuditOutcome, string> = {
  success: 'Sucesso',
  denied: 'Negado',
  failed: 'Falhou',
}
export const OUTCOME_TONE: Record<AuditOutcome, BadgeTone> = {
  success: 'success',
  denied: 'warning',
  failed: 'danger',
}

export interface AuditSearchParams {
  pessoa?: string
  acao?: string
  tipo?: string
  resultado?: string
  de?: string
  ate?: string
  antes?: string
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

const text = (value: string | undefined) => value?.trim() || undefined

const oneOf = <T extends string>(values: readonly T[], value: string | undefined): T | undefined =>
  values.find((item) => item === value)

/** Turns the page query (Portuguese names) into the portal-api filter, dropping invalid values. */
export const auditFilter = (params: AuditSearchParams): Partial<AuditQuery> => {
  const before = Number(params.antes)
  const filter: Partial<AuditQuery> = {
    actor: text(params.pessoa),
    action: text(params.acao),
    kind: oneOf(AUDIT_KINDS, params.tipo),
    outcome: oneOf(AUDIT_OUTCOMES, params.resultado),
    from: params.de && DATE.test(params.de) ? params.de : undefined,
    to: params.ate && DATE.test(params.ate) ? params.ate : undefined,
    before: Number.isInteger(before) && before > 0 ? before : undefined,
  }
  return Object.fromEntries(
    Object.entries(filter).filter(([, value]) => value !== undefined),
  ) as Partial<AuditQuery>
}

/** Link to the next page keeping the filters of the current one. */
export const nextPageHref = (params: AuditSearchParams, before: number) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (key !== 'antes' && typeof value === 'string' && value) search.set(key, value)
  }
  search.set('antes', String(before))
  return `${AUDIT_PATH}?${search.toString()}`
}
