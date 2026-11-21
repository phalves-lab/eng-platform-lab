import type { BoardColumn, FlowCategory } from '@lab/contracts'
import { FlowItemLink } from '@/components/flow/flow-item-link'
import { formatDays } from '@/lib/flow'
import { cn } from '@/lib/utils'

const ACCENT: Record<FlowCategory, string> = {
  todo: 'bg-muted-foreground/40',
  in_progress: 'bg-primary',
  review: 'bg-info',
  blocked: 'bg-destructive',
  done: 'bg-success',
}

interface KanbanBoardProps {
  readonly columns: BoardColumn[]
  readonly doneWindowDays: number
}

/** Read-only kanban: one column per workflow category, oldest card in the column on top. */
export function KanbanBoard({ columns, doneWindowDays }: KanbanBoardProps) {
  return (
    <div className="w-full max-w-full overflow-x-auto pb-2">
      <div className="grid min-w-max auto-cols-[16rem] grid-flow-col gap-4">
        {columns.map((column) => (
          <section
            key={column.category}
            aria-label={`${column.label}, ${column.items.length} itens`}
            className="flex max-h-[32rem] flex-col rounded-xl border bg-muted/30"
          >
            <header className="flex items-center gap-2 border-b px-3 py-2.5">
              <span className={cn('size-2 rounded-full', ACCENT[column.category])} aria-hidden />
              <h3 className="flex-1 text-sm font-medium">{column.label}</h3>
              <span className="text-xs tabular-nums text-muted-foreground">
                {column.items.length}
              </span>
            </header>
            {column.category === 'done' ? (
              <p className="px-3 pt-2 text-xs text-muted-foreground">
                Concluídos nos últimos {doneWindowDays} dias.
              </p>
            ) : null}
            <ul className="flex-1 space-y-2 overflow-y-auto p-2">
              {column.items.map((item) => (
                <li key={item.key} className="space-y-2 rounded-lg border bg-card p-3 shadow-xs">
                  <FlowItemLink item={item} />
                  <p className="text-xs text-muted-foreground">
                    {[item.status, item.component].filter(Boolean).join(' · ')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Há{' '}
                    <span className="font-medium text-foreground tabular-nums">
                      {formatDays(item.daysInColumn)}
                    </span>{' '}
                    na coluna
                  </p>
                </li>
              ))}
              {column.items.length === 0 ? (
                <li className="px-1 py-6 text-center text-xs text-muted-foreground">Vazia</li>
              ) : null}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
