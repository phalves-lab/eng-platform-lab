import type { QueueRow } from '@lab/eng-metrics/contract'
import { ExternalLink } from 'lucide-react'
import { ChecksBadge, LevelBadge, SignalBadge } from '@/components/status-badges'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatBusinessDays, formatDateTime } from '@/lib/format'

interface QueueViewProps {
  readonly rows: QueueRow[]
}

const PrLink = ({ row }: { readonly row: QueueRow }) => (
  <a
    href={row.url}
    target="_blank"
    rel="noreferrer"
    className="group inline-flex items-start gap-1 font-medium hover:underline"
  >
    <span className="text-muted-foreground">#{row.number}</span>
    <span className="line-clamp-2">{row.title}</span>
    <ExternalLink
      className="mt-0.5 size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
      aria-hidden
    />
  </a>
)

const TaskInfo = ({ row }: { readonly row: QueueRow }) =>
  row.taskKey ? (
    <span className="text-xs text-muted-foreground">
      {row.taskKey}
      {row.taskStatus ? ` · ${row.taskStatus}` : ''}
    </span>
  ) : (
    <span className="text-xs text-warning">sem task</span>
  )

const Risks = ({ risks }: { readonly risks: string[] }) =>
  risks.length ? (
    <div className="flex flex-wrap gap-1">
      {risks.map((risk) => (
        <Badge key={risk} variant="outline" className="font-mono">
          {risk.replace('risk:', '')}
        </Badge>
      ))}
    </div>
  ) : (
    <span className="text-muted-foreground">nenhum</span>
  )

const reviewers = (row: QueueRow) => row.requestedReviewers.join(', ') || 'ninguém pedido'

const QueueCards = ({ rows }: QueueViewProps) => (
  <ul className="grid gap-3 md:grid-cols-2 xl:hidden">
    {rows.map((row) => (
      <li key={row.number} className="space-y-2 rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">{row.position}º na fila</span>
          <LevelBadge level={row.level} />
        </div>
        <PrLink row={row} />
        <TaskInfo row={row} />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Autor</dt>
          <dd>{row.author}</dd>
          <dt className="text-muted-foreground">Revisores</dt>
          <dd>{reviewers(row)}</dd>
          <dt className="text-muted-foreground">Na fila</dt>
          <dd>{formatBusinessDays(row.ageBusinessDays)}</dd>
          <dt className="text-muted-foreground">Linhas</dt>
          <dd className="tabular-nums">{row.lines}</dd>
        </dl>
        <div className="flex flex-wrap gap-1.5">
          <ChecksBadge checks={row.checks} />
          <SignalBadge signal={row.botSignal} />
        </div>
      </li>
    ))}
  </ul>
)

const QueueGrid = ({ rows }: QueueViewProps) => (
  <div className="hidden overflow-hidden rounded-xl border xl:block">
    <Table>
      <TableHeader className="bg-muted/50">
        <TableRow>
          <TableHead className="w-10">#</TableHead>
          <TableHead className="min-w-64">PR e task</TableHead>
          <TableHead>Autor</TableHead>
          <TableHead>Revisores</TableHead>
          <TableHead>Na fila</TableHead>
          <TableHead>Checks</TableHead>
          <TableHead>Bot</TableHead>
          <TableHead>Risco</TableHead>
          <TableHead className="text-right">Linhas</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.number}>
            <TableCell className="tabular-nums text-muted-foreground">{row.position}</TableCell>
            <TableCell className="whitespace-normal">
              <div className="flex flex-col gap-1">
                <PrLink row={row} />
                <TaskInfo row={row} />
              </div>
            </TableCell>
            <TableCell>{row.author}</TableCell>
            <TableCell className="max-w-40 truncate">{reviewers(row)}</TableCell>
            <TableCell>
              <div className="flex flex-col items-start gap-1">
                <LevelBadge level={row.level} />
                <span className="text-xs text-muted-foreground">
                  {formatBusinessDays(row.ageBusinessDays)} · desde {formatDateTime(row.enteredAt)}
                  {row.enteredFrom === 'jira' ? ' (board)' : ' (PR)'}
                </span>
              </div>
            </TableCell>
            <TableCell>
              <ChecksBadge checks={row.checks} />
            </TableCell>
            <TableCell>
              <SignalBadge signal={row.botSignal} />
            </TableCell>
            <TableCell>
              <Risks risks={row.risks} />
            </TableCell>
            <TableCell className="text-right tabular-nums">{row.lines}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
)

export const QueueView = ({ rows }: QueueViewProps) => (
  <>
    <QueueCards rows={rows} />
    <QueueGrid rows={rows} />
  </>
)
