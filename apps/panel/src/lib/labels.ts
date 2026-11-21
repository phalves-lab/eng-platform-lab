import type { BotSignal, ChecksState, QueueLevel } from '@lab/eng-metrics/contract'

export type Tone = 'success' | 'warning' | 'destructive' | 'secondary'

export const LEVEL_LABEL: Record<QueueLevel, string> = {
  ok: 'No prazo',
  atencao: 'Atenção',
  atrasado: 'Atrasado',
}

export const LEVEL_TONE: Record<QueueLevel, Tone> = {
  ok: 'success',
  atencao: 'warning',
  atrasado: 'destructive',
}

export const SIGNAL_LABEL: Record<Exclude<BotSignal, null>, string> = {
  pronto: 'Pronto',
  gate: 'Pendências',
  ajustes: 'Ajustes',
}

export const signalLabel = (signal: BotSignal) =>
  signal === null ? 'Sem comentário' : SIGNAL_LABEL[signal]

export const signalTone = (signal: BotSignal): Tone => {
  if (signal === 'pronto') return 'success'
  if (signal === 'gate') return 'warning'
  if (signal === 'ajustes') return 'destructive'
  return 'secondary'
}

export const checksLabel = (checks: ChecksState) => {
  if (checks === 'SUCCESS') return 'Verde'
  if (checks === 'FAILURE' || checks === 'ERROR') return 'Vermelho'
  if (checks === 'PENDING' || checks === 'EXPECTED') return 'Rodando'
  return 'Sem checks'
}

export const checksTone = (checks: ChecksState): Tone => {
  if (checks === 'SUCCESS') return 'success'
  if (checks === 'FAILURE' || checks === 'ERROR') return 'destructive'
  if (checks === 'PENDING' || checks === 'EXPECTED') return 'warning'
  return 'secondary'
}
