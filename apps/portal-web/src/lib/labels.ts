import type { StandardStatus } from '@lab/contracts'

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
    .replace(/\s*\|\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
