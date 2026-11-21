const TIME_ZONE = 'America/Sao_Paulo'
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

const dayMonth = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
  day: '2-digit',
  month: '2-digit',
})

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso))

/** Início de semana vem do coletor em UTC; formatar em UTC evita cair no domingo anterior. */
export const formatWeek = (iso: string) => dayMonth.format(new Date(iso))

export const formatDecimal = (value: number, digits = 1) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })

export const formatHours = (hours: number | null) =>
  hours === null ? 'sem dados' : `${formatDecimal(hours)} h`

export const formatBusinessDays = (days: number | null) => {
  if (days === null) return 'sem dados'
  return `${formatDecimal(days)} ${days >= 2 ? 'dias úteis' : 'dia útil'}`
}

export const formatRelative = (iso: string, now: number) => {
  const elapsed = Math.max(0, now - new Date(iso).getTime())
  if (elapsed < MINUTE) return 'agora'
  if (elapsed < HOUR) return `há ${Math.floor(elapsed / MINUTE)} min`
  if (elapsed < DAY) return `há ${Math.floor(elapsed / HOUR)} h`
  const days = Math.floor(elapsed / DAY)
  return `há ${days} ${days === 1 ? 'dia' : 'dias'}`
}
