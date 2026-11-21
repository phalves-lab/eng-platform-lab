import { BellRing, CircleCheckBig } from 'lucide-react'
import type { Metadata } from 'next'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { DatasetSwitch } from '@/components/review/dataset-switch'
import { PrLink } from '@/components/review/pr-link'
import { ToneBadge } from '@/components/status-badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api } from '@/lib/api'
import {
  formatBusinessDays,
  formatDateTime,
  LEVEL_LABEL,
  LEVEL_TONE,
  SIGNAL_LABEL,
  SIGNAL_TONE,
} from '@/lib/labels'

export const metadata: Metadata = { title: 'Fila de review' }

interface ReviewProps {
  readonly searchParams: Promise<{ conjunto?: string }>
}

export default async function ReviewPage({ searchParams }: ReviewProps) {
  const { conjunto = 'lab' } = await searchParams
  const datasets = await api.datasets()
  const id = datasets.some((d) => d.id === conjunto) ? conjunto : (datasets[0]?.id ?? 'lab')
  const dataset = await api.dataset(id)

  return (
    <>
      <PageHeader
        title="Fila de review"
        description={`Na ordem em que cada item entrou em code review no board. Dados de ${formatDateTime(dataset.generatedAt)}.`}
        actions={<DatasetSwitch basePath="/review" current={id} datasets={datasets} />}
      />
      <Card>
        <CardHeader>
          <CardTitle>Fila</CardTitle>
          <CardDescription>{dataset.queue.length} PRs aguardando review.</CardDescription>
        </CardHeader>
        <CardContent>
          {dataset.queue.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead className="min-w-72">PR</TableHead>
                    <TableHead>Autor</TableHead>
                    <TableHead>Revisores</TableHead>
                    <TableHead>Na fila</TableHead>
                    <TableHead>Bot</TableHead>
                    <TableHead className="text-right">Linhas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dataset.queue.map((row) => (
                    <TableRow key={row.number}>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {row.position}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <div className="flex flex-col gap-1">
                          <PrLink row={row} />
                          <span className="text-xs text-muted-foreground">
                            {row.taskKey ?? 'sem task'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{row.author}</TableCell>
                      <TableCell className="max-w-40 truncate">
                        {row.requestedReviewers.join(', ') || 'ninguém pedido'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <ToneBadge tone={LEVEL_TONE[row.level]}>
                            {LEVEL_LABEL[row.level]}
                          </ToneBadge>
                          <span className="text-xs text-muted-foreground">
                            {formatBusinessDays(row.ageBusinessDays)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {row.botSignal ? (
                          <ToneBadge tone={SIGNAL_TONE[row.botSignal]}>
                            {SIGNAL_LABEL[row.botSignal]}
                          </ToneBadge>
                        ) : (
                          <ToneBadge tone="secondary">Sem comentário</ToneBadge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.lines}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyState
              icon={CircleCheckBig}
              title="Fila vazia"
              description="Nenhum PR aguardando review."
            />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellRing className="size-4 text-warning" aria-hidden />
            Alertas
          </CardTitle>
          <CardDescription>O que trava a entrega ou foge do combinado.</CardDescription>
        </CardHeader>
        <CardContent>
          {dataset.alerts.length ? (
            <ul className="divide-y">
              {dataset.alerts.map((alert) => (
                <li
                  key={`${alert.kind}-${alert.subject}`}
                  className="flex items-start gap-3 py-2.5"
                >
                  <ToneBadge tone={alert.severity === 'alta' ? 'danger' : 'warning'}>
                    {alert.kind}
                  </ToneBadge>
                  <p className="text-sm">
                    <span className="font-medium">{alert.subject}</span>{' '}
                    <span className="text-muted-foreground">{alert.message}</span>
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum alerta neste momento.</p>
          )}
        </CardContent>
      </Card>
    </>
  )
}
