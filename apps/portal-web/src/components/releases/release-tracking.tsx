import type { ReleaseRun, ReleaseTrackedPull, ReleaseTracking } from '@lab/contracts'
import { ArrowUpRight, Database, GitPullRequestArrow, History } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { ReleasePublish } from '@/components/releases/release-publish'
import { ToneBadge } from '@/components/status-badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ApiError } from '@/lib/api'
import { formatDateTime } from '@/lib/labels'
import {
  approvalsText,
  canPublish,
  PULL_STATE_LABEL,
  PULL_STATE_TONE,
  RUN_ACTION_LABEL,
  RUN_STATUS_LABEL,
  RUN_STATUS_TONE,
  runSummary,
  sidesText,
  SUMMARY_LABEL,
  SUMMARY_TONE,
} from '@/lib/release-write'
import { CHECKS_LABEL, CHECKS_TONE } from '@/lib/releases'
import { releasesApi } from '@/lib/releases-api'

function ExternalLink({
  href,
  children,
}: {
  readonly href: string
  readonly children: React.ReactNode
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-0.5 font-medium underline-offset-4 hover:text-primary hover:underline"
    >
      {children}
      <ArrowUpRight className="size-3 shrink-0" aria-hidden />
    </a>
  )
}

function PullRow({
  pull,
  project,
  canWrite,
}: {
  readonly pull: ReleaseTrackedPull
  readonly project: string
  readonly canWrite: boolean
}) {
  return (
    <TableRow>
      <TableCell className="whitespace-normal">
        <div className="flex min-w-48 flex-col gap-1">
          <ExternalLink href={pull.url}>
            {pull.repo}#{pull.number}
          </ExternalLink>
          <span className="line-clamp-2 text-sm">{pull.title}</span>
          <span className="text-xs text-muted-foreground">
            {sidesText(pull.sides)} · última geração por {pull.lastRunBy} em{' '}
            {formatDateTime(pull.lastRunAt)}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <ToneBadge tone={PULL_STATE_TONE[pull.state]}>{PULL_STATE_LABEL[pull.state]}</ToneBadge>
        {pull.state === 'open' && pull.mergeable === false ? (
          <span className="mt-1 block text-xs text-destructive">Conflito</span>
        ) : null}
      </TableCell>
      <TableCell>
        {pull.summary.url ? (
          <a href={pull.summary.url} target="_blank" rel="noreferrer">
            <ToneBadge tone={SUMMARY_TONE[pull.summary.state]}>
              {SUMMARY_LABEL[pull.summary.state]}
            </ToneBadge>
          </a>
        ) : (
          <ToneBadge tone={SUMMARY_TONE[pull.summary.state]}>
            {SUMMARY_LABEL[pull.summary.state]}
          </ToneBadge>
        )}
      </TableCell>
      <TableCell>
        <ToneBadge tone={CHECKS_TONE[pull.checks.state]}>
          {CHECKS_LABEL[pull.checks.state]}
        </ToneBadge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {approvalsText(pull.approvals)}
      </TableCell>
      <TableCell className="text-right">
        {pull.published ? (
          <ExternalLink href={pull.published.url}>{pull.published.tag}</ExternalLink>
        ) : null}
        {canWrite && canPublish(pull) ? (
          <ReleasePublish project={project} repo={pull.repo} number={pull.number} />
        ) : null}
        {!pull.published && !(canWrite && canPublish(pull)) ? (
          <span className="text-xs text-muted-foreground">
            {pull.state === 'merged' ? 'Publicação pendente' : 'Depois do merge'}
          </span>
        ) : null}
      </TableCell>
    </TableRow>
  )
}

function TrackingTable({
  tracking,
  canWrite,
}: {
  readonly tracking: ReleaseTracking
  readonly canWrite: boolean
}) {
  if (!tracking.pulls.length) {
    return (
      <EmptyState
        icon={GitPullRequestArrow}
        title="Nenhuma PR de release aberta pelo portal"
        description="Quando um líder gerar a release, as PRs aparecem aqui com o resumo da IA, o CI, as aprovações e o merge."
      />
    )
  }
  return (
    <div className="-mx-6 overflow-x-auto px-6">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>PR</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Resumo IA</TableHead>
            <TableHead>CI</TableHead>
            <TableHead>Reviews</TableHead>
            <TableHead className="text-right">Tag</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tracking.pulls.map((pull) => (
            <PullRow
              key={`${pull.repo}#${pull.number}`}
              pull={pull}
              project={tracking.project.id}
              canWrite={canWrite}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function HistoryTable({ runs }: { readonly runs: ReleaseRun[] }) {
  if (!runs.length) {
    return (
      <EmptyState
        icon={History}
        title="Nenhuma release gerada pelo portal"
        description="Cada execução, concluída, com falha ou recusada, fica registrada aqui com quem fez e quando."
      />
    )
  }
  return (
    <div className="-mx-6 overflow-x-auto px-6">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Quando</TableHead>
            <TableHead>Ação</TableHead>
            <TableHead>Quem</TableHead>
            <TableHead>Resultado</TableHead>
            <TableHead className="min-w-64">Detalhe</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => (
            <TableRow key={run.id}>
              <TableCell className="text-sm tabular-nums">
                {formatDateTime(run.createdAt)}
              </TableCell>
              <TableCell className="text-sm">{RUN_ACTION_LABEL[run.action]}</TableCell>
              <TableCell className="text-sm">{run.actor}</TableCell>
              <TableCell>
                <ToneBadge tone={RUN_STATUS_TONE[run.result.status]}>
                  {RUN_STATUS_LABEL[run.result.status]}
                </ToneBadge>
              </TableCell>
              <TableCell className="whitespace-normal">
                <div className="flex flex-col gap-1 text-sm">
                  <span className="break-words">{runSummary(run)}</span>
                  <span className="flex flex-wrap gap-x-3 gap-y-1">
                    {run.result.pulls.map((pull) => (
                      <ExternalLink key={pull.url} href={pull.url}>
                        {pull.repo}#{pull.number}
                      </ExternalLink>
                    ))}
                    {run.result.release ? (
                      <ExternalLink href={run.result.release.url}>
                        {run.result.release.tag}
                      </ExternalLink>
                    ) : null}
                  </span>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function ReleaseTrackingSkeleton() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Carregando o acompanhamento">
      <Skeleton className="h-56" />
      <Skeleton className="h-48" />
    </div>
  )
}

export async function ReleaseTrackingSection({
  project,
  canWrite,
}: {
  readonly project: string
  readonly canWrite: boolean
}) {
  let data: [ReleaseTracking, ReleaseRun[]]
  try {
    data = await Promise.all([releasesApi.tracking(project), releasesApi.history(project)])
  } catch (error) {
    if (!(error instanceof ApiError)) throw error
    return (
      <EmptyState
        icon={Database}
        title={
          error.status === 503
            ? 'Acompanhamento indisponível'
            : 'Não foi possível ler o acompanhamento'
        }
        description={error.message}
      />
    )
  }
  const [tracking, runs] = data
  return (
    <div className="grid gap-6">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Acompanhamento</CardTitle>
          <CardDescription>
            PRs de release abertas pelo portal: resumo por IA, CI, aprovações e merge. Depois do
            merge, um líder publica a tag e a GitHub Release.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TrackingTable tracking={tracking} canWrite={canWrite && tracking.writeEnabled} />
        </CardContent>
      </Card>
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Histórico do projeto</CardTitle>
          <CardDescription>Auditoria das execuções: quem, quando e o resultado.</CardDescription>
        </CardHeader>
        <CardContent>
          <HistoryTable runs={runs} />
        </CardContent>
      </Card>
    </div>
  )
}
