import type { PanelDataset } from '@lab/eng-metrics/contract'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildMyQueue, listPeople, myPrStatus } from '../src/lib/my-queue'
import { readStoredPerson, storePerson } from '../src/lib/person-storage'
import { row } from './fixtures'

describe('minha fila', () => {
  const rows = [
    row({ number: 1, author: 'ana', requestedReviewers: ['bruno'] }),
    row({ number: 2, author: 'carla', requestedReviewers: ['ana'], position: 2 }),
    row({
      number: 3,
      author: 'diego',
      requestedReviewers: ['ana'],
      reviewedBy: ['ana'],
      position: 3,
    }),
    row({ number: 4, author: 'ana', checks: 'FAILURE', position: 4 }),
  ]

  it('separa o que revisar, o que já revisei e os meus PRs com a ação de cada um', () => {
    const queue = buildMyQueue(rows, 'ana')
    expect(queue.toReview.map((r) => r.number)).toEqual([2])
    expect(queue.reviewed.map((r) => r.number)).toEqual([3])
    expect(queue.mine.map(({ row: r, status }) => [r.number, status.label])).toEqual([
      [1, 'Aguardando review'],
      [4, 'Check vermelho'],
    ])
    expect(queue.actions).toBe(2)
    expect(buildMyQueue(rows, 'ninguem')).toMatchObject({ toReview: [], mine: [], actions: 0 })
  })

  it('diz o que o autor precisa fazer em cada situação do PR', () => {
    expect(myPrStatus(row({ checks: 'ERROR' })).label).toBe('Check vermelho')
    expect(myPrStatus(row({ botSignal: 'ajustes' })).label).toBe('Bot pediu ajustes')
    expect(myPrStatus(row({ hasHumanReview: true }))).toMatchObject({
      label: 'Com review',
      tone: 'success',
    })
    expect(myPrStatus(row({ requestedReviewers: [] })).label).toBe('Sem revisor')
    expect(myPrStatus(row())).toMatchObject({
      label: 'Aguardando review',
      tone: 'secondary',
      needsAction: false,
    })
    expect(myPrStatus(row({ level: 'atrasado' })).tone).toBe('warning')
  })

  it('lista as pessoas do conjunto sem bots', () => {
    const dataset = {
      queue: [
        row({
          author: 'dependabot[bot]',
          requestedReviewers: ['carla'],
          reviewedBy: ['github-actions'],
        }),
      ],
      metrics: { reviewers: [{ reviewer: 'bruno' }], pairs: [{ author: 'ana' }] },
    } as unknown as PanelDataset
    expect(listPeople(dataset)).toEqual(['ana', 'bruno', 'carla'])
  })
})

describe('pessoa lembrada no navegador', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('guarda e lê a pessoa, e segue sem erro quando o armazenamento falha', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
    })
    expect(readStoredPerson()).toBeNull()
    storePerson('ana')
    expect(readStoredPerson()).toBe('ana')

    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('bloqueado')
        },
        setItem: () => {
          throw new Error('bloqueado')
        },
      },
    })
    expect(readStoredPerson()).toBeNull()
    expect(() => storePerson('ana')).not.toThrow()
  })
})
