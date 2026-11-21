import type { McpClient, McpScope, PluginMaturity, StandardStatus } from '@lab/contracts'

export type BadgeTone = 'success' | 'warning' | 'info' | 'danger' | 'secondary'

export const STATUS_LABEL: Record<StandardStatus, string> = {
  VIGENTE: 'Vigente',
  CONFLITO: 'Em conflito',
  PROPOSTO: 'Proposto',
  LACUNA: 'Lacuna',
  DESCONHECIDO: 'Sem status',
}

export const STATUS_TONE: Record<StandardStatus, BadgeTone> = {
  VIGENTE: 'success',
  CONFLITO: 'warning',
  PROPOSTO: 'info',
  LACUNA: 'danger',
  DESCONHECIDO: 'secondary',
}

export const LEVEL_LABEL = { ok: 'No prazo', atencao: 'Atenção', atrasado: 'Atrasado' } as const
export const LEVEL_TONE: Record<keyof typeof LEVEL_LABEL, BadgeTone> = {
  ok: 'success',
  atencao: 'warning',
  atrasado: 'danger',
}

export const SIGNAL_LABEL = { pronto: 'Pronto', gate: 'Pendências', ajustes: 'Ajustes' } as const
export const SIGNAL_TONE: Record<keyof typeof SIGNAL_LABEL, BadgeTone> = {
  pronto: 'success',
  gate: 'warning',
  ajustes: 'danger',
}

export const PR_TONE: Record<'success' | 'warning' | 'destructive' | 'secondary', BadgeTone> = {
  success: 'success',
  warning: 'warning',
  destructive: 'danger',
  secondary: 'secondary',
}

/** Area prefix of a standard ID, such as ENG-GIT for ENG-GIT-02. */
export const areaOf = (id: string) => id.replace(/-\d+$/, '')

const businessDay = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

export const formatBusinessDays = (days: number) =>
  `${businessDay.format(days)} ${days >= 2 ? 'dias úteis' : 'dia útil'}`

export const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))

/** Turns `file.md › Section › Item` into a short readable origin. */
export const shortSource = (source: string) => source.split(' › ').slice(-2).join(' › ')

/** Strips markdown markers from a handbook snippet so it reads as plain text. */
export const cleanSnippet = (snippet: string) =>
  snippet
    .replace(/(^|\s)-\s+\*\*(.+?):\*\*/g, '$1$2:')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replaceAll('|', ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

/** Uppercases the first letter, since handbook fields are written as sentence continuations. */
export const capitalize = (text: string) =>
  text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1)

const looksLikeRepo = (value: string) => !/\s/.test(value) && /[-/@]/.test(value)

/**
 * Splits a system heading such as `MMS API (martech-mms-api)` into a display name and the repository,
 * keeping parentheses that are not a repository name, such as `Insider (CDP)`.
 */
export const splitSystemName = (name: string): { title: string; repo: string | null } => {
  const open = name.lastIndexOf('(')
  if (open <= 0 || !name.endsWith(')')) return { title: name, repo: null }
  const inner =
    name
      .slice(open + 1, -1)
      .split(',')[0]
      ?.trim() ?? ''
  if (!looksLikeRepo(inner)) return { title: name, repo: null }
  return { title: name.slice(0, open).trim(), repo: inner }
}

const SYSTEM_STATUS: { prefix: string; label: string; tone: BadgeTone }[] = [
  { prefix: 'producao', label: 'Produção', tone: 'success' },
  { prefix: 'piloto', label: 'Piloto', tone: 'info' },
  { prefix: 'homolog', label: 'Homologação', tone: 'info' },
  { prefix: 'legado', label: 'Legado', tone: 'warning' },
  { prefix: 'descontinuado', label: 'Descontinuado', tone: 'secondary' },
  { prefix: 'incerto', label: 'Incerto', tone: 'secondary' },
]

const trimEnd = (value: string, chars: string) => {
  let end = value.length
  while (end > 0 && chars.includes(value.charAt(end - 1))) end -= 1
  return value.slice(0, end)
}

/** Reduces the free-text status of a system card to a short label, a badge tone and its detail. */
export const systemStatus = (status: string | null | undefined) => {
  if (!status) return null
  const normalized = status
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  const known = SYSTEM_STATUS.find((item) => normalized.startsWith(item.prefix))
  const cut = [...status].findIndex((char) => '(,;'.includes(char))
  const detail = cut > 0 ? trimEnd(status.slice(cut + 1), '.) ').trim() : ''
  if (known)
    return { label: known.label, tone: known.tone, detail: detail ? capitalize(detail) : null }
  return { label: capitalize(trimEnd(status, '. ')), tone: 'secondary' as BadgeTone, detail: null }
}

/** Separates the trailing `(Fonte: ...)` of a glossary definition from the definition itself. */
export const splitSource = (text: string): { body: string; source: string | null } => {
  const trimmed = text.trim()
  const at = trimmed.lastIndexOf('(Fonte:')
  if (at < 0 || !trimmed.endsWith(')')) return { body: text, source: null }
  return { body: trimmed.slice(0, at).trim(), source: trimmed.slice(at + 7, -1).trim() }
}
export const MATURITIES: PluginMaturity[] = ['approved', 'pilot', 'draft']

export const MATURITY_LABEL: Record<PluginMaturity, string> = {
  approved: 'Aprovado',
  pilot: 'Piloto',
  draft: 'Rascunho',
}

export const MATURITY_TONE: Record<PluginMaturity, BadgeTone> = {
  approved: 'success',
  pilot: 'info',
  draft: 'secondary',
}

export const SCOPE_LABEL: Record<McpScope, string> = { read: 'Leitura', write: 'Escrita' }
export const SCOPE_TONE: Record<McpScope, BadgeTone> = { read: 'success', write: 'warning' }

export const CLIENT_LABEL: Record<McpClient, string> = {
  'claude-code': 'Claude Code',
  kiro: 'Kiro',
  cursor: 'Cursor',
}

export const isMaturity = (value: string | undefined): value is PluginMaturity =>
  MATURITIES.some((maturity) => maturity === value)

/** Formats an ISO date (YYYY-MM-DD) as dd/mm/yyyy without shifting it across time zones. */
export const formatDate = (iso: string) => iso.split('-').reverse().join('/')
