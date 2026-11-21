import type { BlockedByMe } from '@lab/contracts'
import { FlowItemLink } from '@/components/flow/flow-item-link'
import { CATEGORY_LABEL } from '@/lib/flow'

export function BlockedByMeList({ items }: { readonly items: BlockedByMe[] }) {
  return (
    <ul className="divide-y">
      {items.map((item) => (
        <li key={`${item.key}-${item.blocker.key}`} className="space-y-1.5 py-3">
          <FlowItemLink item={item} />
          <p className="text-xs text-muted-foreground">
            {item.assignee ? `${item.assignee} · ` : ''}
            {CATEGORY_LABEL[item.category]} · espera{' '}
            {item.blocker.url ? (
              <a
                href={item.blocker.url}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-primary hover:underline"
              >
                {item.blocker.key}
              </a>
            ) : (
              <span className="font-mono">{item.blocker.key}</span>
            )}
            , que está com você
          </p>
        </li>
      ))}
    </ul>
  )
}
