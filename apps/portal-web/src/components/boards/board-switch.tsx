import type { BoardSummary } from '@lab/contracts'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface BoardSwitchProps {
  readonly basePath: string
  readonly current: string
  readonly boards: BoardSummary[]
}

export function BoardSwitch({ basePath, current, boards }: BoardSwitchProps) {
  return (
    <nav
      aria-label="Projeto"
      className="inline-flex max-w-full overflow-x-auto rounded-lg border bg-card p-1"
    >
      {boards.map((board) => (
        <Link
          key={board.project}
          href={`${basePath}?projeto=${board.project}`}
          aria-current={board.project === current ? 'page' : undefined}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
            board.project === current &&
              'bg-primary text-primary-foreground hover:text-primary-foreground',
          )}
        >
          {board.project}
          <span className="ml-1.5 text-xs opacity-70">{board.items}</span>
        </Link>
      ))}
    </nav>
  )
}
