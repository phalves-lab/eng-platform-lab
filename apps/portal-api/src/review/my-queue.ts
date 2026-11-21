import type { QueueRow } from '@lab/eng-metrics/contract'

export type Tone = 'success' | 'warning' | 'destructive' | 'secondary'

export interface PrStatus {
  label: string
  tone: Tone
  hint: string
  needsAction: boolean
}

export interface MyQueue {
  toReview: QueueRow[]
  reviewed: QueueRow[]
  mine: { row: QueueRow; status: PrStatus }[]
  actions: number
}

/**
 * Next step for the author of an open PR, most urgent first. On GitHub a reviewer leaves the
 * requested list after reviewing and only returns when asked again, so a requested reviewer
 * always means a pending review.
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

export const buildMyQueue = (rows: QueueRow[], login: string): MyQueue => {
  const others = rows.filter((row) => row.author !== login)
  const toReview = others.filter((row) => row.requestedReviewers.includes(login))
  const reviewed = others.filter(
    (row) => row.reviewedBy.includes(login) && !row.requestedReviewers.includes(login),
  )
  const mine = rows
    .filter((row) => row.author === login)
    .map((row) => ({ row, status: myPrStatus(row) }))
  return {
    toReview,
    reviewed,
    mine,
    actions: toReview.length + mine.filter((item) => item.status.needsAction).length,
  }
}
