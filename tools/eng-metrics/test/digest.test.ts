import { describe, expect, it, vi } from 'vitest'
import type { PanelDataset, QueueRow } from '../src/contract.js'
import { demoDataset } from '../src/demo.js'
import { buildDigest, pendingReviews, postDigest } from '../src/digest.js'
import { buildPanelData } from '../src/panel-data.js'

const NOW = '2026-11-20T15:00:00.000Z'
const URL = 'https://painel.example/#/visao-geral'

const demo = (): PanelDataset => {
  const [dataset] = buildPanelData(
    [{ id: 'demo', title: 'Exemplo', dataset: demoDataset(NOW) }],
    NOW,
  ).datasets
  if (!dataset) throw new Error('sem conjunto')
  return dataset
}

const empty = (): PanelDataset => ({
  ...demo(),
  label: 'Lab',
  queue: [],
  alerts: [],
  metrics: { ...demo().metrics, merged: 1, medianHoursToFirstReview: null },
})

describe('resumo diário', () => {
  it('resume fila, primeiro da fila, carga por pessoa, alertas altos e métricas', () => {
    const dataset = demo()
    const text = buildDigest(dataset, URL)
    const first = dataset.queue[0] as QueueRow
    expect(text).toMatch(
      /^Resumo da esteira, sexta-feira, 20\/11 \(Exemplo: time fictício de 8 pessoas\)/,
    )
    expect(text).toContain(`Fila de review: ${dataset.queue.length} PRs`)
    expect(text).toContain(`Primeiro da fila: #${first.number}`)
    expect(text).toContain('Reviews pendentes por pessoa:')
    expect(text).toMatch(/Alertas: \d+ de severidade alta e \d+ média\./)
    expect(text).toContain('h até a 1ª review (mediana)')
    expect(text.endsWith(`Painel: ${URL}`)).toBe(true)
  })

  it('diz quando a fila e os alertas estão vazios e quando não há review humana', () => {
    const text = buildDigest(empty(), URL)
    expect(text).toContain('Fila de review vazia.')
    expect(text).toContain('Nenhum alerta.')
    expect(text).toContain('1 PR mergeado, sem review humana na janela.')
  })

  it('conta revisores pedidos, inclusive quem foi pedido de novo depois de revisar', () => {
    const base = demo().queue[0] as QueueRow
    const dataset = {
      ...empty(),
      queue: [
        { ...base, requestedReviewers: ['bruno', 'ana'], reviewedBy: ['ana'] },
        { ...base, requestedReviewers: ['bruno', 'carla'], reviewedBy: [] },
      ],
    }
    expect(pendingReviews(dataset)).toEqual([
      ['bruno', 2],
      ['ana', 1],
      ['carla', 1],
    ])
  })

  it('envia ao webhook como { text } e falha com resposta de erro', async () => {
    const ok = vi.fn(async () => new Response('ok'))
    await postDigest('https://hooks.example/x', 'oi', ok)
    expect(ok).toHaveBeenCalledWith('https://hooks.example/x', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'oi' }),
    })
    const failing = vi.fn(async () => new Response('', { status: 403 }))
    await expect(postDigest('https://hooks.example/x', 'oi', failing)).rejects.toThrow('403')
  })
})
