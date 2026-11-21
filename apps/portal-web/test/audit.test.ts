import { describe, expect, it } from 'vitest'
import {
  actionLabel,
  AUDIT_KINDS,
  AUDIT_OUTCOMES,
  auditFilter,
  KIND_LABEL,
  nextPageHref,
  OUTCOME_LABEL,
  OUTCOME_TONE,
} from '../src/lib/audit'

describe('audit page helpers', () => {
  it('names known actions and keeps unknown routes as recorded', () => {
    expect(actionLabel('POST /api/releases/execute')).toBe('Gerar release')
    expect(actionLabel('DELETE /api/conversations/:id')).toBe('Apagar conversa')
    expect(actionLabel('PATCH /api/novo')).toBe('PATCH /api/novo')
    expect(AUDIT_KINDS.map((kind) => KIND_LABEL[kind])).toEqual(['Escrita', 'Leitura de time'])
    expect(AUDIT_OUTCOMES.map((value) => [OUTCOME_LABEL[value], OUTCOME_TONE[value]])).toEqual([
      ['Sucesso', 'success'],
      ['Negado', 'warning'],
      ['Falhou', 'danger'],
    ])
  })

  it('turns the page query into the API filter and drops invalid values', () => {
    expect(
      auditFilter({
        pessoa: ' ana ',
        acao: 'releases',
        tipo: 'write',
        resultado: 'denied',
        de: '2026-11-01',
        ate: '2026-11-21',
        antes: '40',
      }),
    ).toEqual({
      actor: 'ana',
      action: 'releases',
      kind: 'write',
      outcome: 'denied',
      from: '2026-11-01',
      to: '2026-11-21',
      before: 40,
    })
    expect(
      auditFilter({ pessoa: '  ', tipo: 'apagar', resultado: 'x', de: '21/11', antes: '-3' }),
    ).toEqual({})
  })

  it('builds the next page link keeping the filters', () => {
    expect(nextPageHref({ pessoa: 'ana', antes: '90', tipo: '' }, 12)).toBe(
      '/admin/auditoria?pessoa=ana&antes=12',
    )
  })
})
