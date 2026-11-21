import {
  BellRing,
  ChartNoAxesCombined,
  CircleCheckBig,
  Clock,
  DatabaseZap,
  GitMerge,
  GitPullRequestClosed,
  Ruler,
  Timer,
  Users,
} from 'lucide-react'
import type { Metadata } from 'next'
import { AlertList } from '@/components/delivery/alert-list'
import { ReviewPairs } from '@/components/delivery/review-pairs'
import { ReviewTrendChart } from '@/components/delivery/review-trend-chart'
import { ReviewerLoadTable } from '@/components/delivery/reviewer-load'
import { SignalDistribution } from '@/components/delivery/signal-distribution'
import { EmptyState } from '@/components/empty-state'
import { KpiCard } from '@/components/kpi-card'
import { PageHeader } from '@/components/page-header'
import { DatasetSwitch } from '@/components/review/dataset-switch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api, ApiError } from '@/lib/api'
import {
  formatCount,
  formatHours,
  formatLines,
  formatMedianBusinessDays,
  hasTrend,
  pairsByAuthor,
  resolveDataset,
  reviewersByName,
  signalDistribution,
  trendSeries,
} from '@/lib/delivery'
import { formatDateTime } from '@/lib/labels'

export const metadata: Metadata = { title: 'Review' }

const BASE_PATH = '/entregas/review'

interface DeliveryReviewProps {
  readonly searchParams: Promise<{ conjunto?: string }>
}

const loadReview = async (requested: string | undefined) => {
  try {
    const datasets = await api.datasets()
    const id = resolveDataset(requested, datasets)
    if (!id) return { state: 'empty' as const }
    return { state: 'ready' as const, datasets, data: await api.reviewMetrics(id) }
  } catch (error) {
    if (error instanceof ApiError && error.status === 503) return { state: 'unavailable' as const }
    throw error
  }
}

export default async function DeliveryReviewPage({ searchParams }: DeliveryReviewProps) {
  const { conjunto } = await searchParams
  const result = await loadReview(conjunto)

  if (result.state !== 'ready') {
    return (
      <>
        <PageHeader
          title="Review"
          description="Como o time revisou e entregou na janela do coletor."
        />
        <EmptyState
          icon={DatabaseZap}
          title={
            result.state === 'unavailable'
              ? 'Os dados de entrega ainda não foram gerados'
              : 'Nenhum conjunto de dados de review'
          }
          description="Rode o coletor do eng-metrics para publicar o data.json e recarregue a página."
        />
      </>
    )
  }

  const { datasets, data } = result
  const { metrics } = data
  const signals = signalDistribution(metrics.signals)
  const reviewers = reviewersByName(metrics.reviewers)
  const pairs = pairsByAuthor(metrics.pairs)
  const windowLabel = `últimos ${metrics.windowDays} dias`

  return (
    <>
      <PageHeader
        title="Review"
        description={`Como o time revisou e entregou nos ${windowLabel}. Dados de ${formatDateTime(data.generatedAt)}.`}
        actions={<DatasetSwitch basePath={BASE_PATH} current={data.dataset} datasets={datasets} />}
      />

      <section
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
        aria-label="Indicadores de review"
      >
        <KpiCard
          label="Mergeados"
          value={metrics.merged}
          icon={GitMerge}
          hint={`PRs nos ${windowLabel}`}
        />
        <KpiCard
          label="Até a 1ª review"
          value={formatHours(metrics.medianHoursToFirstReview)}
          icon={Clock}
          tone={metrics.medianHoursToFirstReview === null ? 'muted' : 'default'}
          hint="Mediana desde o PR pronto"
        />
        <KpiCard
          label="Até o merge"
          value={formatMedianBusinessDays(metrics.medianBusinessDaysToMerge)}
          icon={Timer}
          tone={metrics.medianBusinessDaysToMerge === null ? 'muted' : 'default'}
          hint="Mediana em dias úteis"
        />
        <KpiCard
          label="Tamanho mediano"
          value={formatLines(metrics.medianSize)}
          icon={Ruler}
          tone={metrics.medianSize === null ? 'muted' : 'default'}
          hint="Linhas somadas e removidas"
        />
        <KpiCard
          label="Check falhando"
          value={metrics.mergedWithFailingChecks}
          icon={GitPullRequestClosed}
          tone={metrics.mergedWithFailingChecks ? 'warning' : 'success'}
          hint={
            metrics.mergedWithFailingChecks
              ? `De ${formatCount(metrics.merged, 'mergeado', 'mergeados')}`
              : 'Nenhum merge com check vermelho'
          }
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Tendência de 8 semanas</CardTitle>
            <CardDescription>
              PRs mergeados por semana e mediana de horas até a primeira review.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {hasTrend(data.trend) ? (
              <ReviewTrendChart data={trendSeries(data.trend)} />
            ) : (
              <EmptyState
                icon={ChartNoAxesCombined}
                title="Sem merges nas últimas 8 semanas"
                description="Quando o time mergear PRs, a tendência semanal aparece aqui."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sinais do bot</CardTitle>
            <CardDescription>Como o bot de review avaliou os PRs da janela.</CardDescription>
          </CardHeader>
          <CardContent>
            {signals.total ? (
              <SignalDistribution total={signals.total} slices={signals.slices} />
            ) : (
              <EmptyState
                icon={CircleCheckBig}
                title="Nenhum PR na janela"
                description="Os sinais do bot aparecem quando houver PRs abertos no período."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Carga de review por pessoa</CardTitle>
            <CardDescription>
              Em ordem alfabética. Serve para equilibrar a carga, não para comparar pessoas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {reviewers.length ? (
              <ReviewerLoadTable reviewers={reviewers} />
            ) : (
              <EmptyState
                icon={Users}
                title="Nenhuma review na janela"
                description="A carga de cada pessoa aparece quando houver reviews no período."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pares autor e revisor</CardTitle>
            <CardDescription>
              Quem revisou os PRs de quem. Ajuda a ver onde o conhecimento está concentrado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pairs.length ? (
              <ReviewPairs authors={pairs} />
            ) : (
              <EmptyState
                icon={Users}
                title="Nenhum par na janela"
                description="Os pares aparecem quando houver reviews no período."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellRing className="size-4 text-warning" aria-hidden />
            Alertas
          </CardTitle>
          <CardDescription>O que trava a entrega ou foge do combinado.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.alerts.length ? (
            <AlertList alerts={data.alerts} />
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum alerta neste momento.</p>
          )}
        </CardContent>
      </Card>
    </>
  )
}
