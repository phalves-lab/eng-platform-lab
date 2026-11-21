import type { MyWorkResponse, TeamWorkResponse, User } from '@lab/contracts'
import {
  BellRing,
  CircleCheckBig,
  DatabaseZap,
  GitPullRequest,
  Hand,
  Hourglass,
  Inbox,
  Layers,
  ListTodo,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { EmptyState } from '@/components/empty-state'
import { InlineText } from '@/components/inline-text'
import { KpiCard } from '@/components/kpi-card'
import { PageHeader } from '@/components/page-header'
import { DatasetSwitch } from '@/components/review/dataset-switch'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertList } from '@/components/work/alert-list'
import { BlockedByMeList } from '@/components/work/blocked-by-me-list'
import { MyPullRequestList, ReviewRequestList } from '@/components/work/review-lists'
import { TaskList } from '@/components/work/task-list'
import { TeamSection } from '@/components/work/team-section'
import { api, ApiError } from '@/lib/api'
import { NO_DATA } from '@/lib/delivery'
import { daySummary, jiraNotice, parseHomeSearch, reviewNotice, staleHint } from '@/lib/work'

interface HomeProps {
  readonly searchParams: Promise<{ conjunto?: string | string[]; time?: string | string[] }>
}

const canSeeTeam = (user: User) => user.role === 'lead' || user.role === 'admin'

const loadDatasets = async () => {
  try {
    return await api.datasets()
  } catch (error) {
    if (error instanceof ApiError && error.status === 503) return []
    throw error
  }
}

const loadTeam = async (
  user: User,
  filter: { team?: string; dataset?: string },
): Promise<TeamWorkResponse | null> => {
  if (!canSeeTeam(user)) return null
  try {
    return await api.teamWork(filter)
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) return null
    throw error
  }
}

function JiraNoticeCard({ work }: { readonly work: MyWorkResponse }) {
  if (work.jira.state === 'ready') return null
  const notice = jiraNotice(work.jira.reason, work.login)
  return <EmptyState icon={DatabaseZap} title={notice.title} description={notice.description} />
}

function ReviewNoticeCard({ work }: { readonly work: MyWorkResponse }) {
  if (work.review.state === 'ready') return null
  const notice = reviewNotice(work.review)
  return <EmptyState icon={DatabaseZap} title={notice.title} description={notice.description} />
}

interface SectionCardProps {
  readonly title: string
  readonly description: string
  readonly icon?: LucideIcon
  readonly children: ReactNode
}

function SectionCard({ title, description, icon: Icon, children }: SectionCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {Icon ? <Icon className="size-4 text-primary" aria-hidden /> : null}
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function MyTasks({ work }: { readonly work: MyWorkResponse }) {
  if (work.jira.state !== 'ready') return <JiraNoticeCard work={work} />
  const { inProgress, review, blocked } = work.jira
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section aria-label="Em andamento">
        <h3 className="text-sm font-medium">Em andamento ({inProgress.length})</h3>
        <TaskList items={inProgress} empty="Nada em andamento." />
      </section>
      <section aria-label="Em review">
        <h3 className="text-sm font-medium">Em review ({review.length})</h3>
        <TaskList items={review} empty="Nada em review." />
      </section>
      <section aria-label="Bloqueadas">
        <h3 className="text-sm font-medium">Bloqueadas ({blocked.length})</h3>
        <TaskList items={blocked} empty="Nenhuma task bloqueada." />
      </section>
    </div>
  )
}

function ToReview({ work }: { readonly work: MyWorkResponse }) {
  if (work.review.state !== 'ready') return <ReviewNoticeCard work={work} />
  if (work.review.toReview.length) return <ReviewRequestList items={work.review.toReview} />
  return (
    <EmptyState
      icon={CircleCheckBig}
      title="Nenhuma review pedida para você"
      description="Quando alguém pedir sua review, ela aparece aqui na ordem da fila."
    />
  )
}

function WaitingOnMe({ work }: { readonly work: MyWorkResponse }) {
  if (work.jira.state !== 'ready') return <JiraNoticeCard work={work} />
  if (work.jira.blockedByMe.length) return <BlockedByMeList items={work.jira.blockedByMe} />
  return (
    <EmptyState
      icon={CircleCheckBig}
      title="Ninguém espera por você"
      description="Quando uma task sua bloquear a de alguém no Jira, ela aparece aqui."
    />
  )
}

function ChangesRequested({ work }: { readonly work: MyWorkResponse }) {
  if (work.review.state !== 'ready') return <ReviewNoticeCard work={work} />
  if (work.review.changesRequested.length) {
    return <MyPullRequestList items={work.review.changesRequested} />
  }
  return (
    <EmptyState
      icon={CircleCheckBig}
      title="Nenhum PR com mudança pedida"
      description="PRs com ajuste do bot ou review devolvida aparecem aqui."
    />
  )
}

function MyPullRequests({ work }: { readonly work: MyWorkResponse }) {
  if (work.review.state !== 'ready') return <ReviewNoticeCard work={work} />
  if (work.review.mine.length) return <MyPullRequestList items={work.review.mine} />
  return (
    <EmptyState
      icon={GitPullRequest}
      title="Nenhum PR seu aberto"
      description="Seus PRs abertos aparecem aqui com o que cada um precisa."
    />
  )
}

function Alerts({ work }: { readonly work: MyWorkResponse }) {
  if (work.alerts.length) return <AlertList alerts={work.alerts} />
  return (
    <EmptyState
      icon={CircleCheckBig}
      title="Nenhum alerta"
      description="Tasks paradas ou bloqueadas, reviews atrasadas e checks vermelhos aparecem aqui."
    />
  )
}

const staleTone = (stale: number | null) => {
  if (stale === null) return 'muted'
  return stale ? 'warning' : 'success'
}

export default async function HomePage({ searchParams }: HomeProps) {
  const search = parseHomeSearch(await searchParams)
  const [user, datasets, decisions] = await Promise.all([
    api.me(),
    loadDatasets(),
    api.decisions(1),
  ])
  const dataset =
    datasets.find((item) => item.id === search.dataset)?.id ?? datasets[0]?.id ?? undefined
  const [work, team] = await Promise.all([
    api.myWork(dataset),
    loadTeam(user, { team: search.team, dataset }),
  ])
  const summary = daySummary(work)
  const name = work.person?.name ?? user.name

  return (
    <>
      <PageHeader
        title={`Olá, ${name}`}
        description="Seu dia em um lugar: suas tasks, o que depende de você, alertas e as reviews pedidas."
        actions={
          datasets.length ? (
            <DatasetSwitch basePath="/" current={dataset ?? ''} datasets={datasets} />
          ) : undefined
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Resumo do dia">
        <KpiCard
          label="Minhas tasks abertas"
          value={summary.open ?? NO_DATA}
          icon={Layers}
          tone={summary.open === null ? 'muted' : 'default'}
          hint={summary.inReview === null ? 'Jira não ligado' : `${summary.inReview} em review`}
        />
        <KpiCard
          label="Paradas"
          value={summary.stale ?? NO_DATA}
          icon={Hourglass}
          tone={staleTone(summary.stale)}
          hint={staleHint(work.staleAfterBusinessDays)}
        />
        <KpiCard
          label="Dependem de mim"
          value={summary.dependsOnMe}
          icon={Hand}
          tone={summary.dependsOnMe ? 'warning' : 'success'}
          hint="Reviews, itens que você segura e PRs com ajuste pedido"
        />
        <KpiCard
          label="Alertas"
          value={summary.alerts}
          icon={BellRing}
          tone={work.alerts.some((alert) => alert.severity === 'alta') ? 'danger' : 'default'}
          hint={summary.alerts ? 'Veja a lista abaixo' : 'Nada pedindo atenção'}
        />
      </section>

      <SectionCard
        title="Minhas tasks"
        description={`Por situação no Jira, da mais antiga para a mais nova. Parada é a que está sem mudança de status há mais de ${work.staleAfterBusinessDays} dias úteis.`}
      >
        <MyTasks work={work} />
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard
          title="Para eu revisar"
          description="Na ordem da fila: comece pelo primeiro."
          icon={Inbox}
        >
          <ToReview work={work} />
        </SectionCard>
        <SectionCard
          title="Esperando você"
          description="Tasks de outras pessoas bloqueadas por uma task sua."
          icon={Hand}
        >
          <WaitingOnMe work={work} />
        </SectionCard>
        <SectionCard
          title="Mudança pedida"
          description="PRs seus com ajuste pedido pelo bot ou review devolvida."
          icon={GitPullRequest}
        >
          <ChangesRequested work={work} />
        </SectionCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Alertas"
          description="O que pede atenção hoje, do mais grave ao mais leve."
          icon={BellRing}
        >
          <Alerts work={work} />
        </SectionCard>
        <SectionCard title="Meus PRs" description="A próxima ação de cada PR seu.">
          <MyPullRequests work={work} />
        </SectionCard>
      </div>

      {team ? <TeamSection team={team} dataset={dataset} login={work.login} /> : null}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <ListTodo className="size-4 text-primary" aria-hidden />
              Decisões de prioridade 1
            </CardTitle>
            <CardDescription>
              Regras que o time ainda precisa definir. Enquanto não há decisão, vale o padrão mais
              recente.
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/decisoes">Ver todas</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {decisions.length ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {decisions.slice(0, 6).map((decision) => (
                <li key={decision.id} className="rounded-lg border bg-muted/40 p-3">
                  <Link
                    href={`/padroes/${decision.id}`}
                    className="font-mono text-xs text-primary hover:underline"
                  >
                    {decision.id}
                  </Link>
                  <p className="mt-1 text-sm font-medium">
                    <InlineText text={decision.topic} />
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    <InlineText text={decision.question} />
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhuma decisão de prioridade 1 em aberto.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  )
}
