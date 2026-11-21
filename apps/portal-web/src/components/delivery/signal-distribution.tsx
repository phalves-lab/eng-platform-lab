import { cn } from '@/lib/utils'
import { formatShare, type SignalKey, type SignalSlice } from '@/lib/delivery'

const SIGNAL_COLOR: Record<SignalKey, string> = {
  pronto: 'bg-success',
  gate: 'bg-warning',
  ajustes: 'bg-destructive',
  sem_comentario: 'bg-muted-foreground/40',
}

interface SignalDistributionProps {
  readonly total: number
  readonly slices: SignalSlice[]
}

export function SignalDistribution({ total, slices }: SignalDistributionProps) {
  return (
    <div className="space-y-5">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        {slices
          .filter((slice) => slice.count > 0)
          .map((slice) => (
            <div
              key={slice.key}
              className={cn(
                'h-full first:rounded-l-full last:rounded-r-full',
                SIGNAL_COLOR[slice.key],
              )}
              style={{ width: `${slice.share * 100}%` }}
            />
          ))}
      </div>
      <dl className="grid gap-3">
        {slices.map((slice) => (
          <div key={slice.key} className="flex items-center gap-3 text-sm">
            <span className={cn('size-2.5 shrink-0 rounded-[3px]', SIGNAL_COLOR[slice.key])} />
            <dt className="flex-1 text-muted-foreground">{slice.label}</dt>
            <dd className="font-medium tabular-nums">{slice.count}</dd>
            <dd className="w-11 text-right text-xs tabular-nums text-muted-foreground">
              {formatShare(slice.share)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        {total} PRs abertos na janela, pelo último comentário do bot de review.
      </p>
    </div>
  )
}
