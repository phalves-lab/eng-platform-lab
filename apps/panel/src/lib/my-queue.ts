import type { PanelDataset, QueueRow } from '@lab/eng-metrics/contract'
import type { Tone } from '@/lib/labels'

const isBotLogin = (login: string) => login.endsWith('[bot]') || login === 'github-actions'

/** Pessoas que aparecem no conjunto como autoras ou revisoras, sem bots, em ordem alfabética. */
export const listPeople = (dataset: PanelDataset): string[] =>
  [
    ...new Set([
      ...dataset.queue.flatMap((row) => [row.author, ...row.requestedReviewers, ...row.reviewedBy]),
      ...dataset.metrics.reviewers.map((load) => load.reviewer),
      ...dataset.metrics.pairs.map((pair) => pair.author),
    ]),
  ]
    .filter((login) => !isBotLogin(login))
    .sort((a, b) => a.localeCompare(b))

export interface PrStatus {
  label: string
  tone: Tone
  hint: string
  needsAction: boolean
}

/**
 * O que o autor precisa saber do próprio PR, do mais urgente para o menos. No GitHub, quem
 * revisa sai dos revisores pedidos e só volta se for pedido de novo, então revisor pedido
 * significa review pendente.
 */
export const myPrStatus = (row: QueueRow): PrStatus => {
  if (row.checks === 'FAILURE' || row.checks === 'ERROR')
    return {
      label: 'Check vermelho',
      tone: 'destructive',
      hint: 'Corrija o check antes de pedir review.',
      needsAction: true,
    }
  if (row.botSignal === 'ajustes')
    return {
      label: 'Bot pediu ajustes',
      tone: 'destructive',
      hint: 'Leia o comentário do bot e ajuste ou responda.',
      needsAction: true,
    }
  if (row.requestedReviewers.length)
    return {
      label: 'Aguardando review',
      tone: row.level === 'ok' ? 'secondary' : 'warning',
      hint: `Esperando ${row.requestedReviewers.join(', ')}.`,
      needsAction: false,
    }
  if (row.hasHumanReview)
    return {
      label: 'Com review',
      tone: 'success',
      hint: 'Responda os comentários e peça nova review se mudou algo.',
      needsAction: true,
    }
  return {
    label: 'Sem revisor',
    tone: 'warning',
    hint: 'Ninguém foi pedido como revisor. Peça a review para alguém.',
    needsAction: true,
  }
}

export interface MyQueue {
  toReview: QueueRow[]
  reviewed: QueueRow[]
  mine: { row: QueueRow; status: PrStatus }[]
  actions: number
}

export const buildMyQueue = (rows: QueueRow[], person: string): MyQueue => {
  const others = rows.filter((row) => row.author !== person)
  const toReview = others.filter((row) => row.requestedReviewers.includes(person))
  const reviewed = others.filter(
    (row) => row.reviewedBy.includes(person) && !row.requestedReviewers.includes(person),
  )
  const mine = rows
    .filter((row) => row.author === person)
    .map((row) => ({ row, status: myPrStatus(row) }))
  return {
    toReview,
    reviewed,
    mine,
    actions: toReview.length + mine.filter((item) => item.status.needsAction).length,
  }
}
