import {
  CalendarClock,
  ChartNoAxesCombined,
  DatabaseZap,
  Rocket,
  ShieldAlert,
  Siren,
  Timer,
  Wrench,
} from 'lucide-react'
import type { Metadata } from 'next'
import { DoraBandBadge } from '@/components/delivery/dora-band'
import { DoraDeployList } from '@/components/delivery/dora-deploy-list'
import { DoraFilter } from '@/components/delivery/dora-filter'
import { DoraIncidentList } from '@/components/delivery/dora-incident-list'
import { DoraSummaryTable } from '@/components/delivery/dora-summary-table'
import { DoraDeploysChart, DoraDurationChart } from '@/components/delivery/dora-trend-chart'
import { EmptyState } from '@/components/empty-state'
import { KpiCard } from '@/components/kpi-card'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api, ApiError } from '@/lib/api'
import { formatCount } from '@/lib/delivery'
import {
  doraTrendSeries,
  filterOptions,
  formatDuration,
  formatPerWeek,
  formatPerWeekShort,
  formatRate,
  hasDeploys,
  hasDurations,
  leadTimeHint,
  parseFilter,
  restoreHint,
} from '@/lib/dora'
import { formatDateTime } from '@/lib/labels'

export const metadata: Metadata = { title: 'DORA' }

const BASE_PATH = '/entregas/dora'
const DEPLOYS_SHOWN = 12

interface DoraPageProps {
  readonly searchParams: Promise<{ time?: string; repo?: string }>
}

const loadDora = async (filter: { team?: string; repo?: string }) => {
  try {
    return { state: 'ready' as const, data: await api.doraMetrics(filter) }
  } catch (error) {
    if (error instanceof ApiError && error.status === 503) return { state: 'unavailable' as const }
    if (error instanceof ApiError && error.status === 404) return { state: 'unknown' as const }
    throw error
  }
}

const scopeLabel = (filter: { team: string | null; repo: string | null }) => {
  if (filter.team) return `do time ${filter.team}`
  if (filter.repo) return `de ${filter.repo}`
  return 'de todos os repositórios'
}

export default async function DoraPage({ searchParams }: DoraPageProps) {
  const result = await loadDora(parseFilter(await searchParams))

  if (result.state !== 'ready') {
    return (
      <>
        <PageHeader
          title="DORA"
          description="Frequência de deploy, lead time, taxa de falha e tempo de restauração."
        />
        <EmptyState
          icon={DatabaseZap}
          title={
            result.state === 'unavailable'
              ? 'As métricas DORA ainda não foram coletadas'
              : 'Time ou repositório fora do catálogo DORA'
          }
          description={
            result.state === 'unavailable'
              ? 'Rode o worker uma vez para gravar deploys e incidentes e recarregue a página.'
              : 'Escolha um time ou repositório cadastrado em catalog/dora/repos.yaml.'
          }
        />
      </>
    )
  }

  const { data } = result
  const { summary } = data
  const filters = filterOptions(BASE_PATH, data.teams, data.repos, data.filter)
  const trend = doraTrendSeries(data.trend)
  const weeksLabel = `${data.window.weeks} semanas`

  return (
    <>
      <PageHeader
        title="DORA"
        description={`As quatro métricas DORA ${scopeLabel(data.filter)} nas últimas ${weeksLabel}, com a faixa do relatório DORA. Dados de ${formatDateTime(data.generatedAt)}.`}
      />
      <DoraFilter teams={filters.teams} repos={filters.repos} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Métricas DORA">
        <KpiCard
          label="Frequência de deploy"
          value={formatPerWeekShort(summary.deploymentFrequency.perWeek)}
          icon={Rocket}
          tone={summary.deploymentFrequency.deploys ? 'default' : 'muted'}
          badge={<DoraBandBadge band={summary.deploymentFrequency.band} />}
          hint={`${formatCount(summary.deploymentFrequency.deploys, 'deploy', 'deploys')} em produção, ${formatPerWeek(summary.deploymentFrequency.perWeek)}`}
        />
        <KpiCard
          label="Lead time de mudança"
          value={formatDuration(summary.leadTime.medianHours)}
          icon={Timer}
          tone={summary.leadTime.medianHours === null ? 'muted' : 'default'}
          badge={<DoraBandBadge band={summary.leadTime.band} />}
          hint={leadTimeHint(summary.leadTime)}
        />
        <KpiCard
          label="Taxa de falha de mudança"
          value={formatRate(summary.changeFailureRate.rate)}
          icon={ShieldAlert}
          tone={summary.changeFailureRate.failed ? 'warning' : 'default'}
          badge={<DoraBandBadge band={summary.changeFailureRate.band} />}
          hint={`${summary.changeFailureRate.failed} de ${formatCount(summary.changeFailureRate.deploys, 'deploy', 'deploys')} revertidos ou com incidente`}
        />
        <KpiCard
          label="Tempo de restauração"
          value={formatDuration(summary.timeToRestore.medianHours)}
          icon={Wrench}
          tone={summary.timeToRestore.open ? 'warning' : 'default'}
          badge={<DoraBandBadge band={summary.timeToRestore.band} />}
          hint={restoreHint(summary.timeToRestore)}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Deploys por semana</CardTitle>
            <CardDescription>
              Deploys em produção nas últimas {weeksLabel}, separando os que falharam.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {hasDeploys(data.trend) ? (
              <DoraDeploysChart data={trend} />
            ) : (
              <EmptyState
                icon={ChartNoAxesCombined}
                title="Nenhum deploy em produção no período"
                description="Os deploys aparecem quando o pipeline publica o evento ou o worker lê o GitHub."
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Lead time e restauração</CardTitle>
            <CardDescription>Medianas semanais em horas.</CardDescription>
          </CardHeader>
          <CardContent>
            {hasDurations(trend) ? (
              <DoraDurationChart data={trend} />
            ) : (
              <EmptyState
                icon={CalendarClock}
                title="Sem mudança entregue no período"
                description="O lead time aparece quando um PR mergeado chega a produção."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Por repositório</CardTitle>
          <CardDescription>
            Repositórios de catalog/dora/repos.yaml. Faixas conforme o relatório DORA de 2023.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DoraSummaryTable
            label="Repositório"
            rows={data.repos.map((repo) => ({
              key: repo.repo,
              name: repo.repo,
              detail: `${repo.team} · sistema ${repo.system}`,
              summary: repo.summary,
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Por time</CardTitle>
          <CardDescription>
            Soma dos deploys, mudanças e incidentes dos repositórios.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DoraSummaryTable
            label="Time"
            rows={data.teams.map((team) => ({
              key: team.team,
              name: team.team,
              detail: formatCount(team.repos.length, 'repositório', 'repositórios'),
              summary: team.summary,
            }))}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Rocket className="size-4 text-primary" aria-hidden />
              Deploys recentes
            </CardTitle>
            <CardDescription>
              {data.deploys.length > DEPLOYS_SHOWN
                ? `Os ${DEPLOYS_SHOWN} mais recentes de ${data.deploys.length} listados.`
                : 'Deploys em produção no período, do mais recente ao mais antigo.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.deploys.length ? (
              <DoraDeployList deploys={data.deploys.slice(0, DEPLOYS_SHOWN)} />
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum deploy no período.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Siren className="size-4 text-warning" aria-hidden />
              Incidentes
            </CardTitle>
            <CardDescription>Registrados em catalog/incidents, do mais recente.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.incidents.length ? (
              <DoraIncidentList incidents={data.incidents} />
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum incidente no período.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
