import {
  CircleCheckBig,
  DatabaseZap,
  Hourglass,
  Layers,
  OctagonPause,
  PackageCheck,
  Timer,
  TriangleAlert,
  Workflow,
} from 'lucide-react'
import type { Metadata } from 'next'
import { AgingList } from '@/components/flow/aging-list'
import { BlockedList } from '@/components/flow/blocked-list'
import { CycleTimeChart } from '@/components/flow/cycle-time-chart'
import { FlowFilters } from '@/components/flow/flow-filters'
import { ThroughputChart } from '@/components/flow/throughput-chart'
import { EmptyState } from '@/components/empty-state'
import { KpiCard } from '@/components/kpi-card'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api, ApiError } from '@/lib/api'
import {
  cycleSeries,
  firstItems,
  formatAverage,
  formatDays,
  formatPercentiles,
  parseFlowSearch,
  throughputSeries,
  totalDelivered,
  weeklyAverage,
} from '@/lib/flow'
import { formatDateTime } from '@/lib/labels'

export const metadata: Metadata = { title: 'Fluxo' }

const BASE_PATH = '/entregas/fluxo'
const AGING_LIMIT = 8

interface DeliveryFlowProps {
  readonly searchParams: Promise<{
    projeto?: string | string[]
    componente?: string | string[]
    semanas?: string | string[]
  }>
}

const loadFlow = async (filter: ReturnType<typeof parseFlowSearch>) => {
  try {
    return { state: 'ready' as const, data: await api.flowMetrics(filter) }
  } catch (error) {
    if (error instanceof ApiError && error.status === 503) return { state: 'unavailable' as const }
    throw error
  }
}

export default async function DeliveryFlowPage({ searchParams }: DeliveryFlowProps) {
  const filter = parseFlowSearch(await searchParams)
  const result = await loadFlow(filter)

  if (result.state !== 'ready') {
    return (
      <>
        <PageHeader
          title="Fluxo"
          description="Como o trabalho anda do início à entrega, a partir do espelho do Jira."
        />
        <EmptyState
          icon={DatabaseZap}
          title="Os dados do Jira ainda não foram coletados"
          description="Rode o coletor do Jira no worker (npm run collect:jira) com a API ligada ao banco e recarregue a página."
        />
      </>
    )
  }

  const { data } = result
  const delivered = totalDelivered(data.throughput)
  const aging = firstItems(data.aging, AGING_LIMIT)
  const scope = [data.filter.project ?? 'todos os projetos', data.filter.component]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      <PageHeader
        title="Fluxo"
        description={`Do início à entrega nas últimas ${data.filter.weeks} semanas, em ${scope}. Dados de ${formatDateTime(data.generatedAt)}.`}
      />

      <FlowFilters
        basePath={BASE_PATH}
        filter={filter}
        projects={data.options.projects}
        components={data.options.components}
      />

      {data.unmappedStatuses.length ? (
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TriangleAlert className="size-4 text-warning" aria-hidden />
              Status fora do workflow
            </CardTitle>
            <CardDescription>
              Estes status contam como a fazer até entrarem em catalog/jira/workflow.yaml:{' '}
              {data.unmappedStatuses.map((item) => `${item.project} ${item.status}`).join(', ')}.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <section
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
        aria-label="Indicadores de fluxo"
      >
        <KpiCard
          label="Entregas"
          value={delivered}
          icon={PackageCheck}
          hint={formatAverage(weeklyAverage(data.throughput))}
        />
        <KpiCard
          label="Tempo de ciclo p50"
          value={formatDays(data.cycleTime.p50)}
          icon={Timer}
          tone={data.cycleTime.p50 === null ? 'muted' : 'default'}
          hint={formatPercentiles(data.cycleTime.p85, data.cycleTime.p95)}
        />
        <KpiCard
          label="Lead time p50"
          value={formatDays(data.leadTime.p50)}
          icon={Hourglass}
          tone={data.leadTime.p50 === null ? 'muted' : 'default'}
          hint={formatPercentiles(data.leadTime.p85, data.leadTime.p95)}
        />
        <KpiCard
          label="Em andamento"
          value={data.wip.total}
          icon={Layers}
          hint={`${data.wip.inProgress} fazendo, ${data.wip.review} em review`}
        />
        <KpiCard
          label="Bloqueados"
          value={data.wip.blocked}
          icon={OctagonPause}
          tone={data.wip.blocked ? 'danger' : 'success'}
          hint={`${formatDays(data.blocked.blockedDaysInWindow)} bloqueados na janela`}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Entregas por semana</CardTitle>
            <CardDescription>Itens que chegaram a concluído em cada semana.</CardDescription>
          </CardHeader>
          <CardContent>
            {delivered ? (
              <ThroughputChart data={throughputSeries(data.throughput)} />
            ) : (
              <EmptyState
                icon={PackageCheck}
                title="Nenhuma entrega na janela"
                description="Quando itens chegarem a concluído, as entregas semanais aparecem aqui."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tempo de ciclo</CardTitle>
            <CardDescription>
              Do primeiro movimento até concluído, em dias corridos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.cycleTime.count ? (
              <CycleTimeChart data={cycleSeries(data.cycleTime.distribution)} />
            ) : (
              <EmptyState
                icon={Timer}
                title="Sem tempo de ciclo"
                description="A distribuição aparece quando houver entregas na janela."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Workflow className="size-4 text-primary" aria-hidden />
              Itens envelhecendo
            </CardTitle>
            <CardDescription>
              Em andamento, do mais antigo ao mais novo, comparados ao tempo de ciclo da janela.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {aging.shown.length ? (
              <>
                <AgingList items={aging.shown} />
                {aging.hidden ? (
                  <p className="pt-3 text-xs text-muted-foreground">
                    Mais {aging.hidden} itens em andamento, mais novos que os da lista.
                  </p>
                ) : null}
              </>
            ) : (
              <EmptyState
                icon={CircleCheckBig}
                title="Nada em andamento"
                description="Os itens em andamento aparecem aqui com a idade de cada um."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <OctagonPause className="size-4 text-destructive" aria-hidden />
              Bloqueados
            </CardTitle>
            <CardDescription>
              {data.blocked.itemsBlockedInWindow} itens ficaram bloqueados na janela. Aqui, os que
              seguem bloqueados.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.blocked.active.length ? (
              <BlockedList items={data.blocked.active} />
            ) : (
              <EmptyState
                icon={CircleCheckBig}
                title="Nenhum bloqueio ativo"
                description="Itens em status de bloqueio aparecem aqui com o tempo parado."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
