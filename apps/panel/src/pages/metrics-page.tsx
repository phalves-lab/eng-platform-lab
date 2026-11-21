import type { PanelDataset } from '@lab/eng-metrics/contract'
import { CircleX, GitMerge, Ruler, Timer, TimerReset } from 'lucide-react'
import { DeliveryChart, FirstReviewChart, SignalsChart } from '@/components/charts'
import { KpiCard } from '@/components/kpi-card'
import { navItem } from '@/components/navigation'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatBusinessDays, formatHours } from '@/lib/format'

export const MetricsPage = ({ dataset }: { readonly dataset: PanelDataset }) => {
  const { metrics, trend } = dataset
  const page = navItem('metricas')

  return (
    <div className="space-y-6">
      <PageHeader title={page.title} description={page.description} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label="PRs mergeados"
          value={String(metrics.merged)}
          icon={GitMerge}
          hint={`Últimos ${metrics.windowDays} dias`}
        />
        <KpiCard
          label="Até a 1ª review"
          value={formatHours(metrics.medianHoursToFirstReview)}
          icon={Timer}
          hint="Mediana, horas corridas"
        />
        <KpiCard
          label="Até o merge"
          value={formatBusinessDays(metrics.medianBusinessDaysToMerge)}
          icon={TimerReset}
          hint="Mediana, desde o PR pronto"
        />
        <KpiCard
          label="Tamanho do PR"
          value={
            metrics.medianSize === null ? 'sem dados' : `${Math.round(metrics.medianSize)} linhas`
          }
          icon={Ruler}
          hint="Mediana, inclui lockfile"
        />
        <KpiCard
          label="Mergeados com check vermelho"
          value={String(metrics.mergedWithFailingChecks)}
          icon={CircleX}
          tone={metrics.mergedWithFailingChecks ? 'destructive' : 'success'}
          hint="Checks não obrigatórios"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Entregas por semana</CardTitle>
            <CardDescription>PRs mergeados, semana de segunda a domingo.</CardDescription>
          </CardHeader>
          <CardContent>
            <DeliveryChart trend={trend} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tempo até a 1ª review</CardTitle>
            <CardDescription>
              Mediana semanal em horas. Semanas sem review ficam vazias.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FirstReviewChart trend={trend} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sinal do bot de review</CardTitle>
          <CardDescription>
            PRs que ficaram prontos nos últimos {metrics.windowDays} dias, pelo sinal do review de
            IA.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignalsChart signals={metrics.signals} />
        </CardContent>
      </Card>
    </div>
  )
}
