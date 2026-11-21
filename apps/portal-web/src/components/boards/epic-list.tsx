import type { EpicProgress } from '@lab/contracts'
import { FlowItemLink } from '@/components/flow/flow-item-link'
import { Progress } from '@/components/ui/progress'
import { formatEpicProgress } from '@/lib/boards'
import { CATEGORY_LABEL } from '@/lib/flow'

export function EpicList({ epics }: { readonly epics: EpicProgress[] }) {
  return (
    <ul className="divide-y">
      {epics.map((epic) => (
        <li key={epic.key} className="space-y-2 py-3">
          <FlowItemLink item={epic} />
          <div className="flex items-center gap-3">
            <Progress
              value={epic.percent ?? 0}
              className="flex-1"
              aria-label={`Progresso de ${epic.key}`}
            />
            <span className="w-10 text-right text-sm font-medium tabular-nums">
              {epic.percent === null ? '' : `${epic.percent}%`}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {formatEpicProgress(epic.done, epic.total)} · Épico{' '}
            {CATEGORY_LABEL[epic.category].toLowerCase()}
          </p>
        </li>
      ))}
    </ul>
  )
}
