import { describe, expect, it, vi } from 'vitest'
import { countBySeverity, groupAlerts } from '../src/lib/alerts'
import { loadPanelData } from '../src/lib/data'
import {
  formatBusinessDays,
  formatDateTime,
  formatDecimal,
  formatHours,
  formatRelative,
  formatWeek,
} from '../src/lib/format'
import { checksLabel, checksTone, signalLabel, signalTone } from '../src/lib/labels'
import {
  EMPTY_FILTERS,
  filterQueue,
  hasActiveFilters,
  queueAuthors,
  sortQueue,
  summarizeQueue,
} from '../src/lib/queue'
import { parseHash, toHash } from '../src/lib/routes'
import { alert, row } from './fixtures'

describe('formatação', () => {
  it('formata números, horas, dias úteis e datas em pt-BR', () => {
    expect(formatDecimal(15.34)).toBe('15,3')
    expect(formatHours(null)).toBe('sem dados')
    expect(formatHours(2)).toBe('2,0 h')
    expect(formatBusinessDays(null)).toBe('sem dados')
    expect(formatBusinessDays(0.4)).toBe('0,4 dia útil')
    expect(formatBusinessDays(2.5)).toBe('2,5 dias úteis')
    expect(formatDateTime('2026-11-20T22:36:00.000Z')).toBe('20/11, 19:36')
    expect(formatWeek('2026-11-16T00:00:00.000Z')).toBe('16/11')
  })

  it('descreve há quanto tempo algo aconteceu', () => {
    const now = Date.parse('2026-11-20T12:00:00.000Z')
    expect(formatRelative('2026-11-20T11:59:30.000Z', now)).toBe('agora')
    expect(formatRelative('2026-11-20T11:45:00.000Z', now)).toBe('há 15 min')
    expect(formatRelative('2026-11-20T09:00:00.000Z', now)).toBe('há 3 h')
    expect(formatRelative('2026-11-19T11:00:00.000Z', now)).toBe('há 1 dia')
    expect(formatRelative('2026-11-17T11:00:00.000Z', now)).toBe('há 3 dias')
    expect(formatRelative('2026-11-21T00:00:00.000Z', now)).toBe('agora')
  })
})

describe('rótulos', () => {
  it('traduz sinal do bot e checks em texto e tom', () => {
    expect(signalLabel(null)).toBe('Sem comentário')
    expect(signalLabel('gate')).toBe('Pendências')
    expect([
      signalTone('pronto'),
      signalTone('gate'),
      signalTone('ajustes'),
      signalTone(null),
    ]).toEqual(['success', 'warning', 'destructive', 'secondary'])
    expect(
      ['SUCCESS', 'FAILURE', 'ERROR', 'PENDING', 'EXPECTED', null].map((c) =>
        checksLabel(c as never),
      ),
    ).toEqual(['Verde', 'Vermelho', 'Vermelho', 'Rodando', 'Rodando', 'Sem checks'])
    expect([
      checksTone('SUCCESS'),
      checksTone('ERROR'),
      checksTone('PENDING'),
      checksTone(null),
    ]).toEqual(['success', 'destructive', 'warning', 'secondary'])
  })
})

describe('fila', () => {
  const rows = [
    row(),
    row({
      position: 2,
      number: 11,
      author: 'carla',
      level: 'atrasado',
      ageBusinessDays: 4,
      lines: 30,
      botSignal: null,
      hasHumanReview: true,
    }),
    row({
      position: 3,
      number: 12,
      author: 'bruno',
      level: 'atencao',
      ageBusinessDays: 2,
      lines: 900,
      taskKey: null,
      requestedReviewers: ['diego'],
    }),
  ]

  it('filtra por busca, nível, autor e sinal', () => {
    expect(filterQueue(rows, EMPTY_FILTERS)).toHaveLength(3)
    expect(filterQueue(rows, { ...EMPTY_FILTERS, search: ' DIEGO ' }).map((r) => r.number)).toEqual(
      [12],
    )
    expect(filterQueue(rows, { ...EMPTY_FILTERS, search: '#11' }).map((r) => r.number)).toEqual([
      11,
    ])
    expect(filterQueue(rows, { ...EMPTY_FILTERS, level: 'atrasado' }).map((r) => r.number)).toEqual(
      [11],
    )
    expect(filterQueue(rows, { ...EMPTY_FILTERS, author: 'ana' }).map((r) => r.number)).toEqual([
      10,
    ])
    expect(
      filterQueue(rows, { ...EMPTY_FILTERS, signal: 'sem_comentario' }).map((r) => r.number),
    ).toEqual([11])
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false)
    expect(hasActiveFilters({ ...EMPTY_FILTERS, author: 'ana' })).toBe(true)
  })

  it('ordena pela fila, pelo tempo ou pelo tamanho e resume', () => {
    expect(sortQueue(rows, 'tempo').map((r) => r.number)).toEqual([11, 12, 10])
    expect(sortQueue(rows, 'tamanho').map((r) => r.number)).toEqual([12, 10, 11])
    expect(sortQueue([...rows].reverse(), 'fila').map((r) => r.number)).toEqual([10, 11, 12])
    expect(queueAuthors(rows)).toEqual(['ana', 'bruno', 'carla'])
    expect(summarizeQueue(rows)).toEqual({ total: 3, late: 1, attention: 1, withoutReview: 2 })
  })
})

describe('alertas', () => {
  it('agrupa por tipo com severidade alta e grupos maiores primeiro', () => {
    const groups = groupAlerts([
      alert(),
      alert({ kind: 'Check vermelho' }),
      alert({ subject: '#11' }),
      alert({ kind: 'Review parado', severity: 'alta' }),
      alert({ kind: 'Check vermelho', severity: 'alta', subject: '#12' }),
    ])
    expect(groups.map((g) => [g.kind, g.severity, g.alerts.length])).toEqual([
      ['Check vermelho', 'alta', 2],
      ['Review parado', 'alta', 1],
      ['PR grande', 'media', 2],
    ])
    expect(countBySeverity([alert(), alert({ severity: 'alta' })])).toEqual({ alta: 1, media: 1 })
  })
})

describe('rotas', () => {
  it('lê e escreve rota e conjunto no hash', () => {
    expect(parseHash('')).toEqual({ route: 'visao-geral', dataset: null })
    expect(parseHash('#/fila?conjunto=demo')).toEqual({ route: 'fila', dataset: 'demo' })
    expect(parseHash('#/nao-existe')).toEqual({ route: 'visao-geral', dataset: null })
    expect(toHash({ route: 'alertas', dataset: 'lab' })).toBe('#/alertas?conjunto=lab')
    expect(toHash({ route: 'metricas', dataset: null })).toBe('#/metricas')
  })
})

describe('dados', () => {
  it('lê o data.json local e recusa formato desconhecido ou erro HTTP', async () => {
    const data = { schemaVersion: 1, generatedAt: 'x', datasets: [] }
    const ok = vi.fn(async () => Response.json(data))
    await expect(loadPanelData(ok)).resolves.toEqual(data)
    expect(ok).toHaveBeenCalledWith('./data.json', { cache: 'no-store' })
    await expect(
      loadPanelData(vi.fn(async () => Response.json({ schemaVersion: 2 }))),
    ).rejects.toThrow('formato desconhecido')
    await expect(loadPanelData(vi.fn(async () => Response.json(null)))).rejects.toThrow(
      'formato desconhecido',
    )
    await expect(
      loadPanelData(vi.fn(async () => new Response('', { status: 404 }))),
    ).rejects.toThrow('HTTP 404')
  })
})
