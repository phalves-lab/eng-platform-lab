import type { ProjectEpic, ProjectSourceState } from '@lab/contracts'
import { Progress } from '@/components/ui/progress'
import { epicSentence } from '@/lib/projects'

interface ProjectProgressProps {
  readonly epicKey: string | null
  readonly epic: ProjectEpic | null
  readonly jira: ProjectSourceState
}

export function ProjectProgress({ epicKey, epic, jira }: ProjectProgressProps) {
  return (
    <div className="space-y-2">
      {epic ? (
        <div className="flex items-center gap-3">
          <Progress
            value={epic.percent ?? 0}
            className="flex-1"
            aria-label={`Progresso do épico ${epic.key}`}
          />
          <span className="w-10 text-right text-sm font-medium tabular-nums">
            {epic.percent === null ? '' : `${epic.percent}%`}
          </span>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">{epicSentence(epicKey, epic, jira)}</p>
    </div>
  )
}
