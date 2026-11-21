import type { WorkItem } from '@lab/contracts'
import { FlowItemLink } from '@/components/flow/flow-item-link'
import { ToneBadge } from '@/components/status-badge'
import { describeStatus } from '@/lib/flow'
import { formatBusinessDays } from '@/lib/labels'

interface TaskListProps {
  readonly items: (WorkItem & { readonly assignee?: string })[]
  readonly empty: string
}

export function TaskList({ items, empty }: TaskListProps) {
  if (!items.length) return <p className="py-3 text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="divide-y">
      {items.map((item) => (
        <li key={item.key} className="space-y-1.5 py-3">
          <FlowItemLink item={item} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {[item.assignee, describeStatus(item.category, item.status, item.component)]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs tabular-nums text-muted-foreground">
                {formatBusinessDays(item.idleBusinessDays)} sem mudança
              </span>
              {item.stale ? <ToneBadge tone="warning">Parada</ToneBadge> : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
