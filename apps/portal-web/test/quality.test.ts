import { describe, expect, it } from 'vitest'
import { activeItem, NAV_GROUPS } from '../src/components/navigation'
import {
  byUrgency,
  CHECK_STATUS_LABEL,
  CHECK_STATUS_TONE,
  DOC_STATUS_LABEL,
  DOC_STATUS_TONE,
  DOC_STATUSES,
  formatAge,
  formatMonths,
  formatOwner,
  formatScore,
  isDocStatus,
  isScoreLevel,
  ownerSummary,
  pendingChecks,
  pendingLabel,
  SCORE_BAR,
  SCORE_LEVEL_LABEL,
  SCORE_LEVEL_TONE,
  SCORE_LEVELS,
} from '../src/lib/quality'

describe('rótulos de qualidade', () => {
  it('dá rótulo e tom a cada nível, situação de checagem e situação de documento', () => {
    expect(
      SCORE_LEVELS.map((level) => [SCORE_LEVEL_LABEL[level], SCORE_LEVEL_TONE[level]]),
    ).toEqual([
      ['Bom', 'success'],
      ['Atenção', 'warning'],
      ['Crítico', 'danger'],
      ['Sem nota', 'secondary'],
    ])
    expect(Object.keys(SCORE_BAR)).toEqual(SCORE_LEVELS)
    expect(Object.keys(CHECK_STATUS_LABEL)).toEqual(Object.keys(CHECK_STATUS_TONE))
    expect(CHECK_STATUS_TONE.fail).toBe('danger')
    expect(DOC_STATUSES.map((status) => DOC_STATUS_LABEL[status])).toEqual([
      'Vencido',
      'Sem dono ou data',
      'Vence em breve',
      'Em dia',
    ])
    expect(DOC_STATUS_TONE.stale).toBe('danger')
  })

  it('valida filtros vindos da URL', () => {
    expect(isScoreLevel('critical')).toBe(true)
    expect(isScoreLevel('otimo')).toBe(false)
    expect(isScoreLevel(undefined)).toBe(false)
    expect(isDocStatus('stale')).toBe(true)
    expect(isDocStatus('vencido')).toBe(false)
  })

  it('formata nota, dono, idade, meses e o resumo de cada dono', () => {
    expect(formatScore(null)).toBe('sem nota')
    expect(formatScore(87)).toBe('87')
    expect(formatOwner(null)).toBe('Sem dono')
    expect(formatOwner('@time')).toBe('@time')
    expect([formatAge(null), formatAge(0), formatAge(1), formatAge(40)]).toEqual([
      'sem data',
      'hoje',
      'há 1 dia',
      'há 40 dias',
    ])
    expect([formatMonths(1), formatMonths(6)]).toEqual(['1 mês', '6 meses'])
    expect(ownerSummary({ ok: 2, expiring: 0, stale: 1, missing: 0 })).toBe('1 vencido e 2 em dia.')
    expect(ownerSummary({ ok: 1, expiring: 1, stale: 2, missing: 1 })).toBe(
      '2 vencidos, 1 sem dono ou data, 1 vencendo e 1 em dia.',
    )
    expect(ownerSummary({ ok: 0, expiring: 0, stale: 0, missing: 3 })).toBe('3 sem dono ou data.')
    expect(ownerSummary({ ok: 0, expiring: 0, stale: 0, missing: 0 })).toBe('Nenhum item.')
  })

  it('ordena checagens pela urgência e conta as pendentes', () => {
    const checks = [
      { id: 'a', status: 'pass' as const, weight: 20 },
      { id: 'b', status: 'partial' as const, weight: 5 },
      { id: 'c', status: 'fail' as const, weight: 5 },
      { id: 'd', status: 'fail' as const, weight: 15 },
      { id: 'e', status: 'unknown' as const, weight: 10 },
    ]
    expect(byUrgency(checks).map((check) => check.id)).toEqual(['d', 'c', 'b', 'e', 'a'])
    expect(checks[0]?.id).toBe('a')
    expect(pendingChecks(checks)).toBe(3)
    expect([pendingLabel(0), pendingLabel(1), pendingLabel(3)]).toEqual([
      'Nenhuma checagem pendente.',
      '1 checagem pede ação.',
      '3 checagens pedem ação.',
    ])
  })

  it('coloca as telas de qualidade no próprio grupo do menu', () => {
    expect(
      NAV_GROUPS.find((group) => group.label === 'Qualidade')?.items.map((item) => item.href),
    ).toEqual(['/qualidade/scorecard', '/qualidade/documentacao', '/qualidade/ia'])
    expect(activeItem('/qualidade/scorecard/pedidos-api')?.title).toBe('Scorecard')
    expect(activeItem('/qualidade/ia')?.title).toBe('IA')
    expect(activeItem('/qualidade/documentacao')?.title).toBe('Documentação')
  })
})
