import type { MyPullRequest, ReviewRequest } from '@lab/contracts'
import { PrLink } from '@/components/review/pr-link'
import { ToneBadge } from '@/components/status-badge'
import { formatBusinessDays, LEVEL_LABEL, LEVEL_TONE, PR_TONE } from '@/lib/labels'

export function ReviewRequestList({ items }: { readonly items: ReviewRequest[] }) {
  return (
    <ul className="divide-y">
      {items.map((row) => (
        <li key={row.number} className="flex items-start gap-3 py-3">
          <span className="w-8 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">
            {row.position}º
          </span>
          <div className="min-w-0 flex-1 space-y-1.5">
            <PrLink row={row} />
            <p className="text-xs text-muted-foreground">
              de {row.author} · {formatBusinessDays(row.ageBusinessDays)} na fila · {row.lines}{' '}
              linhas
            </p>
          </div>
          <ToneBadge tone={LEVEL_TONE[row.level]}>{LEVEL_LABEL[row.level]}</ToneBadge>
        </li>
      ))}
    </ul>
  )
}

export function MyPullRequestList({ items }: { readonly items: MyPullRequest[] }) {
  return (
    <ul className="divide-y">
      {items.map(({ status, ...row }) => (
        <li key={row.number} className="space-y-1.5 py-3">
          <div className="flex items-start justify-between gap-3">
            <PrLink row={row} />
            <ToneBadge tone={PR_TONE[status.tone]}>{status.label}</ToneBadge>
          </div>
          <p className="text-xs text-muted-foreground">{status.hint}</p>
        </li>
      ))}
    </ul>
  )
}
