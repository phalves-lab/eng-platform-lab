import type { AiQualityResponse, CostBucket } from '@lab/contracts'
import {
  BrainCircuit,
  CircleDollarSign,
  DatabaseZap,
  Gauge,
  MessagesSquare,
  TriangleAlert,
} from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { EmptyState } from '@/components/empty-state'
import { KpiCard } from '@/components/kpi-card'
import { PageHeader } from '@/components/page-header'
import { AiCostChart, AiPrecisionChart } from '@/components/quality/ai-charts'
import { ToneBadge } from '@/components/status-badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AI_WINDOWS,
  ORIGIN_LABEL,
  SUITE_LABEL,
  alertMessage,
  budgetShare,
  costChartData,
  formatCalls,
  formatRate,
  formatTokens,
  formatUsd,
  isAiWindow,
  precisionChartData,
  unpricedHint,
} from '@/lib/ai-quality'
import { ApiError } from '@/lib/api'
import { formatDateTime } from '@/lib/labels'
import { qualityApi } from '@/lib/quality-api'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'IA' }

const BASE_PATH = '/qualidade/ia'
const DEFAULT_DAYS = 90
const chip = 'rounded-full border px-3 py-1 text-sm transition-colors hover:bg-muted'
const chipActive = 'border-primary bg-primary-light text-primary hover:bg-primary-light'

interface AiPageProps {
  readonly searchParams: Promise<{ dias?: string }>
}

const loadReport = async (days: number) => {
  try {
    return await qualityApi.ai(days)
  } catch (error) {
    if (error instanceof ApiError && error.status === 503) return null
    throw error
  }
}

function CostTable({
  title,
  description,
  label,
  rows,
}: {
  readonly title: string
  readonly description: string
  readonly label: string
  readonly rows: { key: string; name: string; bucket: CostBucket }[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-36">{label}</TableHead>
                  <TableHead className="text-right">Chamadas</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="font-medium break-all whitespace-normal">
                      {row.name}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.bucket.calls}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatTokens(row.bucket.inputTokens + row.bucket.outputTokens)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatUsd(row.bucket.costUsd)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma chamada no período.</p>
        )}
      </CardContent>
    </Card>
  )
}

function GatewayCard({ gateway }: { readonly gateway: AiQualityResponse['gateway'] }) {
  if (!gateway) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Chave virtual do gateway</CardTitle>
          <CardDescription>
            A leitura do gasto no LiteLLM está desligada. Ligue com PORTAL_LITELLM_SPEND.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }
  const share = budgetShare(gateway.spendUsd, gateway.maxBudgetUsd)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          Chave virtual do gateway
          {gateway.source === 'fake' ? (
            <ToneBadge tone="secondary">adaptador fake</ToneBadge>
          ) : null}
        </CardTitle>
        <CardDescription>
          Gasto da chave <span className="font-mono">{gateway.keyAlias}</span>, lido em{' '}
          {formatDateTime(gateway.readAt)}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-2xl font-semibold tabular-nums">
          {formatUsd(gateway.spendUsd)}
          {gateway.maxBudgetUsd !== null ? (
            <span className="text-sm font-normal text-muted-foreground">
              {' '}
              de {formatUsd(gateway.maxBudgetUsd)}
            </span>
          ) : null}
        </p>
        {share !== null ? <Progress value={share} aria-label={`${share}% do orçamento`} /> : null}
        {gateway.budgetResetAt ? (
          <p className="text-sm text-muted-foreground">
            O orçamento renova em {formatDateTime(gateway.budgetResetAt)}.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default async function AiQualityPage({ searchParams }: AiPageProps) {
  const { dias } = await searchParams
  const days = isAiWindow(dias) ? Number(dias) : DEFAULT_DAYS
  const report = await loadReport(days)
  const description =
    'Precisão dos golden sets do bot e do chat e custo estimado de IA por origem, time e PR.'

  if (!report) {
    return (
      <>
        <PageHeader title="IA" description={description} />
        <EmptyState
          icon={DatabaseZap}
          title="Ainda não há dados de IA no banco"
          description="Rode o coletor de IA no worker para gravar os runs dos golden sets e o uso, e recarregue a página."
          action={
            <code className="rounded bg-muted px-2 py-1 font-mono text-xs break-all">
              npm run collect:ai -w @lab/portal-worker
            </code>
          }
        />
      </>
    )
  }

  const [bot, chat] = report.precision
  const thresholds = { bot: bot?.threshold ?? 0, chat: chat?.threshold ?? 0 }
  const precision = precisionChartData(report.precision)
  const cost = costChartData(report.cost.byDay)
  const hasRuns = precision.length > 0
  const alerted = new Set(report.alerts.map((alert) => alert.suite))
  const { total } = report.cost
  const toneOf = (suite: 'bot' | 'chat', latest: unknown) => {
    if (!latest) return 'muted' as const
    return alerted.has(suite) ? ('danger' as const) : ('success' as const)
  }

  return (
    <>
      <PageHeader title="IA" description={description} />

      <nav aria-label="Período" className="flex flex-wrap gap-2">
        {AI_WINDOWS.map((value) => (
          <Link
            key={value}
            href={value === DEFAULT_DAYS ? BASE_PATH : `${BASE_PATH}?dias=${value}`}
            aria-current={days === value ? 'page' : undefined}
            className={cn(chip, days === value && chipActive)}
          >
            {value} dias
          </Link>
        ))}
      </nav>

      {report.alerts.length ? (
        <section
          aria-label="Alertas de precisão"
          className="flex flex-col gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4"
        >
          {report.alerts.map((alert) => (
            <p key={alert.suite} className="flex items-start gap-2 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
              <span>
                {alertMessage(alert)}{' '}
                <span className="text-muted-foreground">Run de {formatDateTime(alert.runAt)}.</span>
              </span>
            </p>
          ))}
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumo de IA">
        <KpiCard
          label={`Precisão do ${SUITE_LABEL.bot.toLowerCase()}`}
          value={formatRate(bot?.latest?.rate)}
          icon={Gauge}
          tone={toneOf('bot', bot?.latest)}
          hint={`Último run · limiar ${formatRate(thresholds.bot)}`}
        />
        <KpiCard
          label={`Precisão do ${SUITE_LABEL.chat.toLowerCase()}`}
          value={formatRate(chat?.latest?.rate)}
          icon={MessagesSquare}
          tone={toneOf('chat', chat?.latest)}
          hint={`Último run · limiar ${formatRate(thresholds.chat)}`}
        />
        <KpiCard
          label="Custo estimado"
          value={formatUsd(total.costUsd)}
          icon={CircleDollarSign}
          hint={`${formatCalls(total.calls)} em ${days} dias · preços de ${report.pricingVersion}`}
        />
        <KpiCard
          label="Tokens"
          value={formatTokens(total.inputTokens + total.outputTokens)}
          icon={BrainCircuit}
          tone={total.unpricedCalls ? 'warning' : 'default'}
          hint={unpricedHint(total)}
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Precisão ao longo do tempo</CardTitle>
            <CardDescription>
              Acerto de cada run com o modelo real; a linha tracejada é o limiar. Runs offline ficam
              de fora.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {hasRuns ? (
              <AiPrecisionChart data={precision} thresholds={thresholds} />
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum run com modelo no período.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Custo por semana</CardTitle>
            <CardDescription>Estimado pela tabela de preço versionada, por origem.</CardDescription>
          </CardHeader>
          <CardContent>
            {total.calls ? (
              <AiCostChart data={cost} />
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma chamada no período.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <CostTable
          title="Custo por origem"
          description="Bot de review nos PRs, chat do portal e os dois golden sets."
          label="Origem"
          rows={report.cost.byOrigin.map((bucket) => ({
            key: bucket.key,
            name: ORIGIN_LABEL[bucket.key as keyof typeof ORIGIN_LABEL] ?? bucket.key,
            bucket,
          }))}
        />
        <CostTable
          title="Custo por time"
          description="Time dono do módulo revisado pelo bot. O chat não registra quem perguntou."
          label="Time"
          rows={report.cost.byTeam.map((bucket) => ({ key: bucket.key, name: bucket.key, bucket }))}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <CostTable
          title="PRs mais caros"
          description="Chamadas do bot de review por pull request, as 20 de maior custo."
          label="Pull request"
          rows={report.cost.byPullRequest.map((bucket) => ({
            key: bucket.key,
            name: `${bucket.repository}#${bucket.pullRequest}`,
            bucket,
          }))}
        />
        <GatewayCard gateway={report.gateway} />
      </div>
    </>
  )
}
