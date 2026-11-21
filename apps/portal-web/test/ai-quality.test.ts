import type { PrecisionSeries } from '@lab/contracts'
import { describe, expect, it } from 'vitest'
import {
  alertMessage,
  budgetShare,
  costChartData,
  formatCalls,
  formatRate,
  formatTokens,
  formatUsd,
  isAiWindow,
  precisionChartData,
  unpricedHint,
} from '../src/lib/ai-quality'

const point = (runAt: string, rate: number) => ({
  runId: `run-${runAt}`,
  runAt,
  rate,
  passed: 0,
  total: 10,
  model: 'm',
  promptVersion: 'v',
  commit: 'abc1234',
})

describe('Qualidade > IA', () => {
  it('formata dólar, taxa, tokens e chamadas', () => {
    expect(formatUsd(1234.5)).toBe('US$ 1.234,50')
    expect(formatUsd(0)).toBe('US$ 0,00')
    expect(formatUsd(0.0042)).toBe('US$ 0,0042')
    expect(formatRate(0.875)).toBe('88%')
    expect(formatRate(null)).toBe('sem run')
    expect(formatTokens(12000)).toBe('12.000')
    expect(formatCalls(1)).toBe('1 chamada')
    expect(formatCalls(3)).toBe('3 chamadas')
  })

  it('aceita só as janelas oferecidas', () => {
    expect(isAiWindow('90')).toBe(true)
    expect(isAiWindow('7')).toBe(false)
    expect(isAiWindow(undefined)).toBe(false)
  })

  it('junta os dois golden sets no mesmo eixo de datas', () => {
    const series: PrecisionSeries[] = [
      {
        suite: 'bot',
        threshold: 0.8,
        points: [point('2026-11-13T10:00:00.000Z', 0.9), point('2026-11-20T10:00:00.000Z', 0.8)],
        latest: null,
      },
      {
        suite: 'chat',
        threshold: 0.8,
        points: [point('2026-11-14T10:00:00.000Z', 0.75), point('2026-11-20T15:00:00.000Z', 0.7)],
        latest: null,
      },
    ]
    expect(precisionChartData(series)).toEqual([
      { date: '13/11', bot: 90, chat: null },
      { date: '14/11', bot: null, chat: 75 },
      { date: '20/11', bot: 80, chat: 70 },
    ])
  })

  it('soma o custo diário em semanas a partir do início da janela', () => {
    const days = Array.from({ length: 9 }, (_, index) => ({
      day: `2026-11-${String(index + 1).padStart(2, '0')}`,
      byOrigin: { bot: 0.1, chat: 0.01, 'golden-set': 0 },
    }))
    expect(costChartData(days)).toEqual([
      { week: '01/11', bot: 0.7, chat: 0.07, 'golden-set': 0 },
      { week: '08/11', bot: 0.2, chat: 0.02, 'golden-set': 0 },
    ])
    expect(costChartData([])).toEqual([])
  })

  it('explica o alerta, as chamadas sem preço e o uso do orçamento', () => {
    expect(
      alertMessage({
        suite: 'chat',
        rate: 0.7,
        threshold: 0.8,
        runId: 'r',
        runAt: '2026-11-20T10:00:00.000Z',
      }),
    ).toBe('O último run do chat do portal acertou 70%, abaixo do limiar de 80%.')
    const bucket = { key: 'chat', calls: 3, inputTokens: 1, outputTokens: 1, costUsd: 1 }
    expect(unpricedHint({ ...bucket, unpricedCalls: 2 })).toBe('2 chamadas sem preço na tabela')
    expect(unpricedHint({ ...bucket, unpricedCalls: 0 })).toBe('Todas as chamadas com preço')
    expect(budgetShare(25, 50)).toBe(50)
    expect(budgetShare(80, 50)).toBe(100)
    expect(budgetShare(10, null)).toBeNull()
  })
})
