export const CHANNELS = ['email', 'whatsapp', 'sms', 'paid_media'] as const
export type Channel = (typeof CHANNELS)[number]

export const STATUSES = [
  'draft',
  'submitted',
  'approved',
  'rejected',
  'scheduled',
  'cancelled',
] as const
export type Status = (typeof STATUSES)[number]

export interface CampaignRequest {
  id: string
  title: string
  requesterId: string
  businessUnit: string
  channel: Channel
  budgetCents: number
  startDate: string
  endDate: string
  status: Status
  approvals: string[]
  createdAt: string
}

export interface DraftInput {
  title: string
  requesterId: string
  businessUnit: string
  channel: Channel
  budgetCents: number
  startDate: string
  endDate: string
}

export type DomainErrorCode =
  | 'INVALID_TITLE'
  | 'INVALID_PERIOD'
  | 'LEAD_TIME'
  | 'INVALID_BUDGET'
  | 'INVALID_TRANSITION'
  | 'SELF_APPROVAL'
  | 'DUPLICATE_APPROVAL'

export interface DomainError {
  code: DomainErrorCode
  message: string
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: DomainError }

/** Acima deste valor (R$ 50.000) a solicitação precisa de dois aprovadores distintos. */
export const HIGH_BUDGET_CENTS = 5_000_000

/** Antecedência mínima, em dias corridos, entre a criação e o início da campanha. */
export const MIN_LEAD_DAYS = 2

const DAY_MS = 86_400_000

const fail = <T>(code: DomainErrorCode, message: string): Result<T> => ({
  ok: false,
  error: { code, message },
})

const ok = <T>(value: T): Result<T> => ({ ok: true, value })

const toUtcDay = (isoDate: string): number => {
  const [year, month, day] = isoDate.split('-').map(Number)
  return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1)
}

const isIsoDate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(toUtcDay(value))

export const requiredApprovals = (request: Pick<CampaignRequest, 'budgetCents'>): number =>
  request.budgetCents > HIGH_BUDGET_CENTS ? 2 : 1

export const createDraft = (
  input: DraftInput,
  context: { id: string; today: string; now: string },
): Result<CampaignRequest> => {
  const title = input.title.trim()
  if (title.length < 5 || title.length > 120) {
    return fail('INVALID_TITLE', 'O título deve ter entre 5 e 120 caracteres.')
  }
  if (!isIsoDate(input.startDate) || !isIsoDate(input.endDate)) {
    return fail('INVALID_PERIOD', 'Datas devem estar no formato AAAA-MM-DD.')
  }
  if (toUtcDay(input.endDate) < toUtcDay(input.startDate)) {
    return fail('INVALID_PERIOD', 'A data de término não pode ser anterior à data de início.')
  }
  if (toUtcDay(input.startDate) - toUtcDay(context.today) < MIN_LEAD_DAYS * DAY_MS) {
    return fail(
      'LEAD_TIME',
      `A campanha precisa de pelo menos ${MIN_LEAD_DAYS} dias de antecedência.`,
    )
  }
  if (!Number.isInteger(input.budgetCents) || input.budgetCents < 0) {
    return fail(
      'INVALID_BUDGET',
      'O orçamento deve ser um inteiro em centavos, maior ou igual a zero.',
    )
  }
  if (input.channel === 'paid_media' && input.budgetCents === 0) {
    return fail('INVALID_BUDGET', 'Mídia paga exige orçamento maior que zero.')
  }

  return ok({
    id: context.id,
    title,
    requesterId: input.requesterId,
    businessUnit: input.businessUnit,
    channel: input.channel,
    budgetCents: input.budgetCents,
    startDate: input.startDate,
    endDate: input.endDate,
    status: 'draft',
    approvals: [],
    createdAt: context.now,
  })
}

const transition = (
  request: CampaignRequest,
  from: readonly Status[],
  to: Status,
): Result<CampaignRequest> => {
  if (!from.includes(request.status)) {
    return fail('INVALID_TRANSITION', `Não é possível ir de "${request.status}" para "${to}".`)
  }
  return ok({ ...request, status: to })
}

export const submit = (request: CampaignRequest): Result<CampaignRequest> =>
  transition(request, ['draft'], 'submitted')

export const reject = (request: CampaignRequest): Result<CampaignRequest> =>
  transition(request, ['submitted'], 'rejected')

export const schedule = (request: CampaignRequest): Result<CampaignRequest> =>
  transition(request, ['approved'], 'scheduled')

export const cancel = (request: CampaignRequest): Result<CampaignRequest> =>
  transition(request, ['draft', 'submitted'], 'cancelled')

/**
 * Registra uma aprovação. A solicitação só muda para "approved" quando atinge o número
 * de aprovadores exigido pelo orçamento; até lá continua "submitted".
 */
export const approve = (request: CampaignRequest, approverId: string): Result<CampaignRequest> => {
  if (request.status !== 'submitted') {
    return fail(
      'INVALID_TRANSITION',
      `Não é possível aprovar uma solicitação em "${request.status}".`,
    )
  }
  if (approverId === request.requesterId) {
    return fail('SELF_APPROVAL', 'Quem solicitou não pode aprovar a própria campanha.')
  }
  if (request.approvals.includes(approverId)) {
    return fail('DUPLICATE_APPROVAL', 'Este aprovador já aprovou a solicitação.')
  }

  const approvals = [...request.approvals, approverId]
  const status: Status = approvals.length >= requiredApprovals(request) ? 'approved' : 'submitted'
  return ok({ ...request, approvals, status })
}
