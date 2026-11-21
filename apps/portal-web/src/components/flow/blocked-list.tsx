import type { BlockedItem } from '@lab/contracts'
import { FlowItemLink } from '@/components/flow/flow-item-link'
import { formatDays } from '@/lib/flow'
import { formatDateTime } from '@/lib/labels'

export function BlockedList({ items }: { readonly items: BlockedItem[] }) {
  return (
    <ul className="divide-y">
      {items.map((item) => (
        <li key={item.key} className="space-y-1.5 py-3">
          <FlowItemLink item={item} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {item.status} desde {formatDateTime(item.blockedSince)}
              {item.component ? ` · ${item.component}` : ''}
            </p>
            <p className="text-xs text-muted-foreground">
              <span className="text-sm font-medium tabular-nums text-destructive">
                {formatDays(item.blockedDays)}
              </span>{' '}
              agora · {formatDays(item.totalBlockedDays)} no total
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}
