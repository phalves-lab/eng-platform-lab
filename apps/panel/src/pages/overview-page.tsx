import type { PanelDataset } from '@lab/eng-metrics/contract'
import {
  ArrowRight,
  BellRing,
  CircleCheckBig,
  GitMerge,
  Hourglass,
  ListOrdered,
  Timer,
} from 'lucide-react'
import { AlertItem } from '@/components/alert-item'
import { DeliveryChart } from '@/components/charts'
import { EmptyState } from '@/components/empty-state'
import { KpiCard } from '@/components/kpi-card'
import { navItem } from '@/components/navigation'
import { PageHeader } from '@/components/page-header'
import { LevelBadge } from '@/components/status-badges'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { countBySeverity } from '@/lib/alerts'
import { formatBusinessDays, formatHours } from '@/lib/format'
import { summarizeQueue } from '@/lib/queue'
import { toHash } from '@/lib/routes'

const PREVIEW_SIZE = 5

const SeeAll = ({ href, label }: { readonly href: string; readonly label: string }) => (
  <Button asChild variant="ghost" size="sm">
    <a href={href}>
      {label}
      <ArrowRight aria-hidden />
    </a>
  </Button>
)

export const OverviewPage = ({ dataset }: { readonly dataset: PanelDataset }) => {
  const queue = summarizeQueue(dataset.queue)
  const alerts = countBySeverity(dataset.alerts)
  const { metrics } = dataset
  const page = navItem('visao-geral')

  return (
    <div className="space-y-6">
      <PageHeader title={page.title} description={page.description} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Aguardando review"
          value={String(queue.total)}
          icon={ListOrdered}
          hint={`${queue.withoutReview} ainda sem nenhuma review humana`}
        />
        <KpiCard
          label="Atrasados na fila"
          value={String(queue.late)}
          icon={Hourglass}
          tone={queue.late ? 'destructive' : 'success'}
          hint={`${queue.attention} em atenção (mais de 1 dia útil)`}
        />
        <KpiCard
          label="Alertas de severidade alta"
          value={String(alerts.alta)}
          icon={BellRing}
          tone={alerts.alta ? 'destructive' : 'success'}
          hint={`${alerts.media} de severidade média`}
        />
        <KpiCard
          label="Até a 1ª review (mediana)"
          value={formatHours(metrics.medianHoursToFirstReview)}
          icon={Timer}
          hint={`${metrics.merged} PRs mergeados em ${metrics.windowDays} dias`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Próximos da fila</CardTitle>
            <CardDescription>Quem entrou em review primeiro é revisado primeiro.</CardDescription>
            <CardAction>
              <SeeAll href={toHash({ route: 'fila', dataset: dataset.id })} label="Ver fila" />
            </CardAction>
          </CardHeader>
          <CardContent>
            {dataset.queue.length ? (
              <ol className="divide-y">
                {dataset.queue.slice(0, PREVIEW_SIZE).map((row) => (
                  <li key={row.number} className="flex items-center gap-3 py-2.5">
                    <span className="w-5 text-sm tabular-nums text-muted-foreground">
                      {row.position}
                    </span>
                    <div className="min-w-0 flex-1">
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-sm font-medium hover:underline"
                      >
                        #{row.number} {row.title}
                      </a>
                      <span className="text-xs text-muted-foreground">
                        {row.author} · {formatBusinessDays(row.ageBusinessDays)} na fila
                      </span>
                    </div>
                    <LevelBadge level={row.level} />
                  </li>
                ))}
              </ol>
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
            <CardTitle>Alertas que pedem ação</CardTitle>
            <CardDescription>Os mais graves primeiro.</CardDescription>
            <CardAction>
              <SeeAll
                href={toHash({ route: 'alertas', dataset: dataset.id })}
                label="Ver alertas"
              />
            </CardAction>
          </CardHeader>
          <CardContent>
            {dataset.alerts.length ? (
              <ul className="divide-y">
                {dataset.alerts.slice(0, PREVIEW_SIZE).map((alert) => (
                  <AlertItem key={`${alert.kind}-${alert.subject}`} alert={alert} />
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={CircleCheckBig}
                title="Nada pedindo atenção"
                description="Nenhum alerta neste momento."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitMerge className="size-4 text-muted-foreground" aria-hidden />
            Entregas por semana
          </CardTitle>
          <CardDescription>PRs mergeados nas últimas 8 semanas.</CardDescription>
        </CardHeader>
        <CardContent>
          <DeliveryChart trend={dataset.trend} />
        </CardContent>
      </Card>
    </div>
  )
}
