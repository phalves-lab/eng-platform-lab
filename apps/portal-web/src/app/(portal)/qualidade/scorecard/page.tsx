import type { ScoreLevel } from '@lab/contracts'
import { CircleAlert, FolderGit2, Gauge, Search, ShieldCheck } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { EmptyState } from '@/components/empty-state'
import { KpiCard } from '@/components/kpi-card'
import { PageHeader } from '@/components/page-header'
import { ScorecardUnavailable } from '@/components/quality/quality-unavailable'
import { ScoreBar } from '@/components/quality/score-bar'
import { ToneBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
  formatScore,
  isScoreLevel,
  pendingChecks,
  SCORE_LEVEL_LABEL,
  SCORE_LEVEL_TONE,
  SCORE_LEVELS,
} from '@/lib/quality'
import { qualityApi } from '@/lib/quality-api'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Scorecard' }

const BASE_PATH = '/qualidade/scorecard'
const chip = 'rounded-full border px-3 py-1 text-sm transition-colors hover:bg-muted'
const chipActive = 'border-primary bg-primary-light text-primary hover:bg-primary-light'

interface ScorecardProps {
  readonly searchParams: Promise<{ termo?: string; nivel?: string }>
}

const loadScorecard = async (term: string | undefined, level: ScoreLevel | undefined) => {
  try {
    return await qualityApi.scorecard({ ...(term ? { term } : {}), ...(level ? { level } : {}) })
  } catch (error) {
    if (error instanceof ApiError && error.status === 503) return null
    throw error
  }
}

export default async function ScorecardPage({ searchParams }: ScorecardProps) {
  const { termo, nivel } = await searchParams
  const level = isScoreLevel(nivel) ? nivel : undefined
  const data = await loadScorecard(termo, level)

  const header = (description: string) => <PageHeader title="Scorecard" description={description} />
  if (!data) {
    return (
      <>
        {header('Como cada repositório está frente aos padrões do handbook.')}
        <ScorecardUnavailable />
      </>
    )
  }

  const href = (value?: ScoreLevel) => {
    const params = new URLSearchParams()
    if (termo) params.set('termo', termo)
    if (value) params.set('nivel', value)
    const text = params.toString()
    return text ? `${BASE_PATH}?${text}` : BASE_PATH
  }
  const needAttention = data.levels.attention + data.levels.critical

  return (
    <>
      {header(
        `Como cada repositório está frente aos padrões do handbook. Dados de ${formatDateTime(data.generatedAt)}.`,
      )}

      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Resumo do scorecard"
      >
        <KpiCard label="Repositórios" value={data.total} icon={FolderGit2} hint="No catálogo" />
        <KpiCard
          label="Nota média"
          value={formatScore(data.averageScore)}
          icon={Gauge}
          tone={data.averageScore === null ? 'muted' : 'default'}
          hint="De 0 a 100, só checagens lidas"
        />
        <KpiCard
          label="No padrão"
          value={data.levels.good}
          icon={ShieldCheck}
          tone="success"
          hint="Nível bom pela política"
        />
        <KpiCard
          label="Precisam de ação"
          value={needAttention}
          icon={CircleAlert}
          tone={needAttention ? 'warning' : 'success'}
          hint={`${data.levels.critical} em nível crítico`}
        />
      </section>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Filtrar por nível" className="flex flex-wrap gap-2">
          <Link
            href={href()}
            aria-current={level ? undefined : 'page'}
            className={cn(chip, !level && chipActive)}
          >
            Todos <span className="text-muted-foreground tabular-nums">{data.total}</span>
          </Link>
          {SCORE_LEVELS.map((value) => (
            <Link
              key={value}
              href={href(value)}
              aria-current={level === value ? 'page' : undefined}
              className={cn(chip, level === value && chipActive)}
            >
              {SCORE_LEVEL_LABEL[value]}{' '}
              <span className="text-muted-foreground tabular-nums">{data.levels[value]}</span>
            </Link>
          ))}
        </nav>
        <form action={BASE_PATH} className="flex w-full gap-2 lg:w-80" role="search">
          {level ? <input type="hidden" name="nivel" value={level} /> : null}
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              name="termo"
              defaultValue={termo}
              placeholder="Repositório ou time"
              aria-label="Buscar repositórios"
              className="pl-8"
            />
          </div>
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
        </form>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Repositórios</CardTitle>
          <CardDescription>
            Abra um repositório para ver cada checagem, o padrão que a exige e como corrigir.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.repos.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-56">Repositório</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead className="min-w-48">Nota</TableHead>
                    <TableHead>Nível</TableHead>
                    <TableHead className="text-right">Pendências</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.repos.map((repo) => (
                    <TableRow key={repo.id}>
                      <TableCell className="whitespace-normal">
                        <div className="flex flex-col gap-0.5">
                          <Link
                            href={`${BASE_PATH}/${repo.id}`}
                            className="font-medium hover:text-primary hover:underline"
                          >
                            {repo.name}
                          </Link>
                          <span className="font-mono text-xs break-all text-muted-foreground">
                            {repo.repo}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{repo.team}</TableCell>
                      <TableCell>
                        <ScoreBar score={repo.score} level={repo.level} />
                      </TableCell>
                      <TableCell>
                        <ToneBadge tone={SCORE_LEVEL_TONE[repo.level]}>
                          {SCORE_LEVEL_LABEL[repo.level]}
                        </ToneBadge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {repo.error ? (
                          <span className="text-destructive">erro na coleta</span>
                        ) : (
                          pendingChecks(repo.checks)
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyState
              icon={FolderGit2}
              title="Nenhum repositório com esses filtros"
              description="Tente outro termo ou remova o filtro de nível."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href={BASE_PATH}>Limpar filtros</Link>
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>
    </>
  )
}
