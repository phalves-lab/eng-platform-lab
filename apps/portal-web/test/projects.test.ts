import { describe, expect, it } from 'vitest'
import {
  CATEGORY_TONE,
  PROJECT_STATUS,
  RISK_SEVERITY,
  decisionHref,
  epicSentence,
  eventLabel,
  openPullRequestsLabel,
  parseProjectTerm,
} from '../src/lib/projects'

const epic = {
  key: 'LAB-9',
  summary: 'Épico',
  url: null,
  category: 'in_progress' as const,
  total: 4,
  done: 2,
  open: 2,
  blocked: 1,
  percent: 50,
}

describe('projetos no front', () => {
  it('explica o épico, inclusive quando não há progresso para mostrar', () => {
    expect(epicSentence('LAB-9', epic, 'ok')).toBe('2 de 4 concluídos · 2 abertos · 1 bloqueado')
    expect(epicSentence('LAB-9', { ...epic, open: 1, blocked: 0 }, 'ok')).toBe(
      '2 de 4 concluídos · 1 aberto · 0 bloqueados',
    )
    expect(epicSentence('LAB-9', { ...epic, total: 0 }, 'ok')).toBe(
      'LAB-9 ainda não tem itens ligados.',
    )
    expect(epicSentence('LAB-9', null, 'ok')).toBe(
      'O épico LAB-9 ainda não está no espelho do Jira.',
    )
    expect(epicSentence('LAB-9', null, 'unavailable')).toBe(
      'Espelho do Jira indisponível para LAB-9.',
    )
    expect(epicSentence(null, null, 'ok')).toBe('Sem épico cadastrado no catálogo.')
  })

  it('rotula PRs abertos, status, severidade e eventos', () => {
    expect(openPullRequestsLabel(null)).toBe('Fila de review indisponível')
    expect(openPullRequestsLabel(1)).toBe('1 PR aberto')
    expect(openPullRequestsLabel(3)).toBe('3 PRs abertos')
    expect(PROJECT_STATUS.at_risk).toEqual({ label: 'Em risco', tone: 'danger' })
    expect(Object.keys(PROJECT_STATUS)).toHaveLength(5)
    expect(RISK_SEVERITY.high.tone).toBe('danger')
    expect(CATEGORY_TONE.blocked).toBe('danger')
    expect(eventLabel({ topic: 'campanhas.solicitacoes', event: 'solicitacao.criada' })).toBe(
      'campanhas.solicitacoes › solicitacao.criada',
    )
  })

  it('liga decisão ao padrão ou à lista de decisões e lê o termo da busca', () => {
    expect(decisionHref({ id: 'ENG-QA-01', kind: 'standard' })).toBe('/padroes/ENG-QA-01')
    expect(decisionHref({ id: 'ENG-PR-03', kind: 'decision' })).toBe('/decisoes')
    expect(decisionHref({ id: 'XX-1', kind: 'unknown' })).toBeNull()
    expect(parseProjectTerm(' filas ')).toBe('filas')
    expect(parseProjectTerm(['a', 'b'])).toBe('a')
    expect(parseProjectTerm('   ')).toBeUndefined()
    expect(parseProjectTerm(undefined)).toBeUndefined()
    expect(parseProjectTerm('x'.repeat(90))).toHaveLength(80)
  })
})
