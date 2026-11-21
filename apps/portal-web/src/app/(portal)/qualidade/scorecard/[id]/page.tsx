import { ArrowLeft, BookCheck, CloudOff, ExternalLink, Wrench } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { EmptyState } from '@/components/empty-state'
import { InlineText } from '@/components/inline-text'
import { ScorecardUnavailable } from '@/components/quality/quality-unavailable'
import { ScoreBar } from '@/components/quality/score-bar'
import { ToneBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ApiError } from '@/lib/api'
import {
  byUrgency,
  CHECK_STATUS_LABEL,
  CHECK_STATUS_TONE,
  formatScore,
  pendingChecks,
  pendingLabel,
  SCORE_LEVEL_LABEL,
  SCORE_LEVEL_TONE,
} from '@/lib/quality'
import { qualityApi } from '@/lib/quality-api'

interface RepoScorecardProps {
  readonly params: Promise<{ id: string }>
}

const loadRepo = async (id: string) => {
  try {
    return await qualityApi.scorecardRepo(id)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound()
    if (error instanceof ApiError && error.status === 503) return null
    throw error
  }
}

export async function generateMetadata({ params }: RepoScorecardProps): Promise<Metadata> {
  const { id } = await params
  const repo = await qualityApi.scorecardRepo(id).catch(() => null)
  return { title: repo ? `Scorecard · ${repo.name}` : 'Scorecard' }
}

const back = (
  <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
    <Link href="/qualidade/scorecard">
      <ArrowLeft aria-hidden />
      Scorecard
    </Link>
  </Button>
)

export default async function RepoScorecardPage({ params }: RepoScorecardProps) {
  const { id } = await params
  const repo = await loadRepo(id)
  if (!repo) {
    return (
      <>
        {back}
        <ScorecardUnavailable />
      </>
    )
  }
  const pending = pendingChecks(repo.checks)

  return (
    <>
      {back}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm break-all text-muted-foreground">{repo.repo}</span>
            <ToneBadge tone={SCORE_LEVEL_TONE[repo.level]}>
              {SCORE_LEVEL_LABEL[repo.level]}
            </ToneBadge>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">{repo.name}</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {repo.team}
            {repo.description ? ` · ${repo.description}` : ''}
          </p>
        </div>
        {repo.url ? (
          <Button asChild variant="outline" size="sm" className="w-fit">
            <a href={repo.url} target="_blank" rel="noreferrer">
              <ExternalLink aria-hidden />
              Abrir no GitHub
            </a>
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nota geral</CardTitle>
          <CardDescription>
            Média ponderada das checagens lidas. {pendingLabel(pending)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScoreBar score={repo.score} level={repo.level} className="max-w-md" />
        </CardContent>
      </Card>

      {repo.error ? (
        <EmptyState
          icon={CloudOff}
          title="A coleta deste repositório falhou"
          description={repo.error}
        />
      ) : (
        <section className="grid gap-4 lg:grid-cols-2" aria-label="Checagens">
          {byUrgency(repo.checks).map((check) => (
            <Card key={check.id} className="gap-4">
              <CardHeader>
                <CardTitle className="text-base">{check.title}</CardTitle>
                <CardAction>
                  <ToneBadge tone={CHECK_STATUS_TONE[check.status]}>
                    {CHECK_STATUS_LABEL[check.status]}
                  </ToneBadge>
                </CardAction>
                <CardDescription className="col-span-full tabular-nums">
                  Nota {formatScore(check.score)} · peso {check.weight}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="leading-relaxed">{check.detail}</p>
                {check.fix ? (
                  <div className="rounded-lg border bg-muted/40 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      <Wrench className="size-3.5" aria-hidden />
                      Como corrigir
                    </p>
                    <p className="mt-1.5 leading-relaxed break-words">
                      <InlineText text={check.fix} />
                    </p>
                  </div>
                ) : null}
                <Link
                  href={`/padroes/${encodeURIComponent(check.standardId)}`}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
                >
                  <BookCheck className="size-3.5" aria-hidden />
                  <span className="font-mono">{check.standardId}</span>
                  {check.standardTitle ? <span>· {check.standardTitle}</span> : null}
                </Link>
              </CardContent>
            </Card>
          ))}
        </section>
      )}
    </>
  )
}
