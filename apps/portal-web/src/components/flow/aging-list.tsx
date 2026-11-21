import type { AgingItem } from '@lab/contracts'
import { FlowItemLink } from '@/components/flow/flow-item-link'
import { ToneBadge } from '@/components/status-badge'
import { describeStatus, formatDays } from '@/lib/flow'
import { LEVEL_TONE } from '@/lib/labels'

const LEVEL_TEXT = {
  ok: 'No ritmo',
  atencao: 'Acima da mediana',
  atrasado: 'Acima do p85',
} as const

export function AgingList({ items }: { readonly items: AgingItem[] }) {
  return (
    <ul className="divide-y">
      {items.map((item) => (
        <li key={item.key} className="space-y-1.5 py-3">
          <FlowItemLink item={item} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {describeStatus(item.category, item.status, item.component)}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium tabular-nums">{formatDays(item.ageDays)}</span>
              <ToneBadge tone={LEVEL_TONE[item.level]}>{LEVEL_TEXT[item.level]}</ToneBadge>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
