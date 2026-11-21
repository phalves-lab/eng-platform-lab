import type { ScoreLevel } from '@lab/contracts'
import { Progress } from '@/components/ui/progress'
import { formatScore, SCORE_BAR } from '@/lib/quality'
import { cn } from '@/lib/utils'

interface ScoreBarProps {
  readonly score: number | null
  readonly level: ScoreLevel
  readonly className?: string
}

export function ScoreBar({ score, level, className }: ScoreBarProps) {
  return (
    <div className={cn('flex min-w-32 items-center gap-3', className)}>
      <span className="w-14 text-sm font-semibold tabular-nums">{formatScore(score)}</span>
      <Progress
        value={score ?? 0}
        aria-label={score === null ? 'Sem nota' : `Nota ${score} de 100`}
        className={cn('h-1.5 flex-1', SCORE_BAR[level])}
      />
    </div>
  )
}
