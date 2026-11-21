import type { BotSignal, ChecksState, QueueLevel } from '@lab/eng-metrics/contract'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  LEVEL_LABEL,
  LEVEL_TONE,
  checksLabel,
  checksTone,
  signalLabel,
  signalTone,
  type Tone,
} from '@/lib/labels'

interface ToneBadgeProps {
  readonly tone: Tone
  readonly children: ReactNode
  readonly className?: string
}

export const ToneBadge = ({ tone, children, className }: ToneBadgeProps) => (
  <Badge variant={tone} className={className}>
    {children}
  </Badge>
)

export const LevelBadge = ({ level }: { readonly level: QueueLevel }) => (
  <ToneBadge tone={LEVEL_TONE[level]}>{LEVEL_LABEL[level]}</ToneBadge>
)

export const SignalBadge = ({ signal }: { readonly signal: BotSignal }) => (
  <ToneBadge tone={signalTone(signal)}>{signalLabel(signal)}</ToneBadge>
)

export const ChecksBadge = ({ checks }: { readonly checks: ChecksState }) => (
  <ToneBadge tone={checksTone(checks)}>{checksLabel(checks)}</ToneBadge>
)
