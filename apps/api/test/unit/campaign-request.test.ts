import { describe, expect, it } from 'vitest'
import {
  HIGH_BUDGET_CENTS,
  approve,
  cancel,
  createDraft,
  reject,
  requiredApprovals,
  schedule,
  submit,
  type CampaignRequest,
  type DraftInput,
} from '../../src/domain/campaign-request.js'

const context = { id: 'req-1', today: '2026-11-20', now: '2026-11-20T12:00:00.000Z' }

const validInput: DraftInput = {
  title: 'Black Friday Graduação',
  requesterId: 'ana',
  businessUnit: 'graduacao',
  channel: 'email',
  budgetCents: 100_000,
  startDate: '2026-11-25',
  endDate: '2026-11-30',
}

const draftOf = (overrides: Partial<DraftInput> = {}): CampaignRequest => {
  const result = createDraft({ ...validInput, ...overrides }, context)
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

const submittedOf = (overrides: Partial<DraftInput> = {}): CampaignRequest => {
  const result = submit(draftOf(overrides))
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

describe('createDraft', () => {
  it('cria rascunho válido com título sem espaços nas pontas', () => {
    const result = createDraft({ ...validInput, title: '  Black Friday Graduação  ' }, context)
    expect(result).toMatchObject({
      ok: true,
      value: { status: 'draft', title: 'Black Friday Graduação' },
    })
  })

  it.each([
    ['curto', 'abc'],
    ['longo', 'x'.repeat(121)],
  ])('recusa título %s', (_label, title) => {
    expect(createDraft({ ...validInput, title }, context)).toMatchObject({
      ok: false,
      error: { code: 'INVALID_TITLE' },
    })
  })

  it('recusa data fora do formato', () => {
    expect(createDraft({ ...validInput, startDate: '25/11/2026' }, context)).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PERIOD' },
    })
  })

  it('recusa término antes do início', () => {
    expect(
      createDraft({ ...validInput, startDate: '2026-11-30', endDate: '2026-11-25' }, context),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_PERIOD' } })
  })

  it('recusa campanha com menos de 2 dias de antecedência', () => {
    expect(createDraft({ ...validInput, startDate: '2026-11-21' }, context)).toMatchObject({
      ok: false,
      error: { code: 'LEAD_TIME' },
    })
  })

  it('aceita exatamente 2 dias de antecedência', () => {
    expect(createDraft({ ...validInput, startDate: '2026-11-22' }, context).ok).toBe(true)
  })

  it.each([-1, 10.5])('recusa orçamento inválido %s', (budgetCents) => {
    expect(createDraft({ ...validInput, budgetCents }, context)).toMatchObject({
      ok: false,
      error: { code: 'INVALID_BUDGET' },
    })
  })

  it('exige orçamento em mídia paga', () => {
    expect(
      createDraft({ ...validInput, channel: 'paid_media', budgetCents: 0 }, context),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_BUDGET' } })
  })

  it('aceita e-mail sem orçamento', () => {
    expect(createDraft({ ...validInput, budgetCents: 0 }, context).ok).toBe(true)
  })
})

describe('transições', () => {
  it('segue rascunho, envio, aprovação e agendamento', () => {
    const approved = approve(submittedOf(), 'bruno')
    expect(approved).toMatchObject({ ok: true, value: { status: 'approved' } })
    if (!approved.ok) return
    expect(schedule(approved.value)).toMatchObject({ ok: true, value: { status: 'scheduled' } })
  })

  it('não agenda o que não foi aprovado', () => {
    expect(schedule(submittedOf())).toMatchObject({
      ok: false,
      error: { code: 'INVALID_TRANSITION' },
    })
  })

  it('não reenvia o que já foi enviado', () => {
    expect(submit(submittedOf())).toMatchObject({
      ok: false,
      error: { code: 'INVALID_TRANSITION' },
    })
  })

  it('rejeita solicitação enviada', () => {
    expect(reject(submittedOf(), 'Fora do calendário da BU')).toMatchObject({
      ok: true,
      value: { status: 'rejected' },
    })
  })

  it('cancela rascunho e enviada, mas não aprovada', () => {
    expect(cancel(draftOf()).ok).toBe(true)
    expect(cancel(submittedOf()).ok).toBe(true)
    const approved = approve(submittedOf(), 'bruno')
    if (!approved.ok) throw new Error('setup')
    expect(cancel(approved.value)).toMatchObject({
      ok: false,
      error: { code: 'INVALID_TRANSITION' },
    })
  })
})

describe('approve', () => {
  it('não aprova rascunho', () => {
    expect(approve(draftOf(), 'bruno')).toMatchObject({
      ok: false,
      error: { code: 'INVALID_TRANSITION' },
    })
  })

  it('impede o solicitante de aprovar a própria campanha', () => {
    expect(approve(submittedOf(), 'ana')).toMatchObject({
      ok: false,
      error: { code: 'SELF_APPROVAL' },
    })
  })

  it('exige dois aprovadores distintos acima de R$ 50.000', () => {
    const high = submittedOf({ budgetCents: HIGH_BUDGET_CENTS + 1 })
    expect(requiredApprovals(high)).toBe(2)

    const first = approve(high, 'bruno')
    expect(first).toMatchObject({ ok: true, value: { status: 'submitted', approvals: ['bruno'] } })
    if (!first.ok) return

    expect(approve(first.value, 'bruno')).toMatchObject({
      ok: false,
      error: { code: 'DUPLICATE_APPROVAL' },
    })
    expect(approve(first.value, 'carla')).toMatchObject({
      ok: true,
      value: { status: 'approved', approvals: ['bruno', 'carla'] },
    })
  })

  it('exige um aprovador até R$ 50.000 inclusive', () => {
    expect(requiredApprovals({ budgetCents: HIGH_BUDGET_CENTS })).toBe(1)
  })
})

describe('reject com motivo', () => {
  it.each([
    ['vazio', ''],
    ['curto', '  curto  '],
    ['longo', 'x'.repeat(501)],
  ])('recusa motivo %s', (_label, reason) => {
    expect(reject(submittedOf(), reason)).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REASON' },
    })
  })

  it('registra o motivo sem espaços nas pontas', () => {
    expect(reject(submittedOf(), '  Orçamento acima do teto da BU  ')).toMatchObject({
      ok: true,
      value: { status: 'rejected', rejectionReason: 'Orçamento acima do teto da BU' },
    })
  })

  it('aceita os limites de 10 e 500 caracteres', () => {
    expect(reject(submittedOf(), 'x'.repeat(10)).ok).toBe(true)
    expect(reject(submittedOf(), 'x'.repeat(500)).ok).toBe(true)
  })

  it('não rejeita o que não foi enviado, mesmo com motivo válido', () => {
    expect(reject(draftOf(), 'Motivo válido para teste')).toMatchObject({
      ok: false,
      error: { code: 'INVALID_TRANSITION' },
    })
  })

  it('rascunho nasce sem motivo de rejeição', () => {
    expect(draftOf().rejectionReason).toBeNull()
  })
})
