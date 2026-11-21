import {
  ArrowLeft,
  Boxes,
  CircleAlert,
  Flag,
  GitMerge,
  GitPullRequestArrow,
  ListTodo,
  Rocket,
  TriangleAlert,
} from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { DoraDeployList } from '@/components/delivery/dora-deploy-list'
import { EmptyState } from '@/components/empty-state'
import { FlowItemLink } from '@/components/flow/flow-item-link'
import { InlineText } from '@/components/inline-text'
import { KpiCard } from '@/components/kpi-card'
import { ProjectProgress } from '@/components/projects/project-progress'
import { PullRequestList } from '@/components/projects/pull-request-list'
import { ToneBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api, ApiError } from '@/lib/api'
import { BAND_LABEL, bandBadge, repoShortName } from '@/lib/dora'
import { CATEGORY_LABEL } from '@/lib/flow'
import { formatDateTime, splitSystemName } from '@/lib/labels'
import {
  CATEGORY_TONE,
  PROJECT_STATUS,
  RISK_SEVERITY,
  decisionHref,
  openPullRequestsLabel,
} from '@/lib/projects'

interface ProjectProps {
  readonly params: Promise<{ id: string }>
}

const PROJECT_ID = /^[a-z0-9][a-z0-9-]*$/

const loadProject = async (id: string) => {
  if (!PROJECT_ID.test(id)) notFound()
  return api.project(id).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) notFound()
    throw error
  })
}

export async function generateMetadata({ params }: ProjectProps): Promise<Metadata> {
  const { id } = await params
  const project = PROJECT_ID.test(id) ? await api.project(id).catch(() => null) : null
  return { title: project?.name ?? 'Projeto' }
}

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  readonly icon: typeof Flag
  readonly title: string
  readonly description: string
  readonly children: ReactNode
}) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-primary" aria-hidden />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function Unavailable({ text }: { readonly text: string }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      {text}
    </p>
  )
}

function Quiet({ text }: { readonly text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>
}

export default async function ProjectPage({ params }: ProjectProps) {
  const { id } = await params
  const project = await loadProject(id)
  const status = PROJECT_STATUS[project.status]
  const epic = project.epic
  const period = `últimas ${project.windowWeeks} semanas`

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/projetos">
          <ArrowLeft aria-hidden />
          Projetos
        </Link>
      </Button>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <ToneBadge tone={status.tone}>{status.label}</ToneBadge>
          <span className="text-xs text-muted-foreground">Dono: {project.owner}</span>
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">{project.name}</h2>
        <p className="max-w-3xl text-base leading-relaxed text-muted-foreground">
          {project.objective}
        </p>
        <p className="text-xs text-muted-foreground">
          Dados de {formatDateTime(project.generatedAt)}
          {project.repos.length ? ` · ${project.repos.join(', ')}` : ''}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Progresso do épico"
          value={epic && epic.percent !== null ? `${epic.percent}%` : 'Sem dado'}
          hint={project.epicKey ?? 'Sem épico'}
          icon={Flag}
        />
        <KpiCard label="Itens abertos" value={epic?.open ?? 'Sem dado'} icon={ListTodo} />
        <KpiCard
          label="Bloqueados"
          value={epic?.blocked ?? 'Sem dado'}
          icon={TriangleAlert}
          tone={epic?.blocked ? 'danger' : 'default'}
        />
        <KpiCard
          label="PRs abertos"
          value={project.openPullRequests ?? 'Sem dado'}
          hint={
            project.openPullRequests === null
              ? openPullRequestsLabel(null)
              : 'Fila de review e tasks do épico'
          }
          icon={GitPullRequestArrow}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          icon={Flag}
          title="Épico e tasks"
          description="Itens do épico no espelho do Jira, bloqueados primeiro."
        >
          <div className="space-y-4">
            <ProjectProgress epicKey={project.epicKey} epic={epic} jira={project.sources.jira} />
            {project.tasks.length ? (
              <ul className="divide-y">
                {project.tasks.map((task) => (
                  <li key={task.key} className="flex items-start justify-between gap-3 py-2.5">
                    <FlowItemLink item={task} />
                    <ToneBadge tone={CATEGORY_TONE[task.category]}>
                      {CATEGORY_LABEL[task.category]}
                    </ToneBadge>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </Section>

        <Section
          icon={GitPullRequestArrow}
          title="Pull requests"
          description={`Abertos na fila de review e mergeados nas ${period}.`}
        >
          <div className="space-y-5">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">Abertos</h3>
              {project.sources.pullRequests === 'unavailable' ? (
                <Unavailable text="A fila de review ainda não foi coletada." />
              ) : project.pullRequests.open.length ? (
                <PullRequestList items={project.pullRequests.open} />
              ) : (
                <Quiet text="Nenhum PR aberto nos repositórios ou nas tasks do projeto." />
              )}
            </div>
            <div className="space-y-1">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                <GitMerge className="size-3.5" aria-hidden />
                Mergeados
              </h3>
              {project.sources.dora === 'unavailable' ? (
                <Unavailable text="Os PRs mergeados ainda não foram coletados." />
              ) : project.pullRequests.merged.length ? (
                <PullRequestList items={project.pullRequests.merged} />
              ) : (
                <Quiet text={`Nenhum PR mergeado nas ${period}.`} />
              )}
            </div>
          </div>
        </Section>
      </div>

      <Section
        icon={Rocket}
        title="Deploys e DORA"
        description={`Deploys em produção dos repositórios do projeto nas ${period}, mais recentes primeiro.`}
      >
        {project.sources.dora === 'unavailable' ? (
          <Unavailable text="Os deploys ainda não foram coletados." />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {project.dora.length ? (
              <ul className="space-y-3">
                {project.dora.map((repo) => {
                  const bands = [
                    ['Frequência', repo.summary.deploymentFrequency.band],
                    ['Lead time', repo.summary.leadTime.band],
                    ['Falha de mudança', repo.summary.changeFailureRate.band],
                    ['Restauração', repo.summary.timeToRestore.band],
                  ] as const
                  return (
                    <li key={repo.repo} className="space-y-2 rounded-xl border p-3">
                      <p className="text-sm font-medium" title={repo.repo}>
                        {repoShortName(repo.repo)}
                      </p>
                      <dl className="grid grid-cols-2 gap-2 text-xs">
                        {bands.map(([label, band]) => {
                          const badge = bandBadge(band)
                          return (
                            <div key={label} className="space-y-1">
                              <dt className="text-muted-foreground">{label}</dt>
                              <dd>
                                <ToneBadge tone={badge.tone}>
                                  {band ? BAND_LABEL[band] : badge.label}
                                </ToneBadge>
                              </dd>
                            </div>
                          )
                        })}
                      </dl>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <Quiet text="Nenhum repositório do projeto está no cadastro do DORA." />
            )}
            {project.deploys.length ? (
              <DoraDeployList deploys={project.deploys} />
            ) : (
              <Quiet text={`Nenhum deploy em produção nas ${period}.`} />
            )}
          </div>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Section icon={Boxes} title="Sistemas" description="Fichas do handbook ligadas ao projeto.">
          {project.systems.length ? (
            <ul className="space-y-3">
              {project.systems.map((system, index) => {
                const { title } = splitSystemName(system.name)
                return (
                  <li key={`${system.name}-${index}`} className="space-y-0.5">
                    {system.slug ? (
                      <Link
                        href={`/sistemas/${system.slug}`}
                        className="text-sm font-medium hover:text-primary"
                      >
                        {title}
                      </Link>
                    ) : (
                      <p className="text-sm font-medium">
                        {title} <span className="text-xs text-warning-dark">(sem ficha)</span>
                      </p>
                    )}
                    {system.owner ? (
                      <p className="text-xs text-muted-foreground">
                        <InlineText text={system.owner} />
                      </p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : (
            <Quiet text="Nenhum sistema ligado." />
          )}
        </Section>

        <Section
          icon={ListTodo}
          title="Decisões"
          description="Decisões pendentes e padrões que afetam o projeto."
        >
          {project.decisions.length ? (
            <ul className="space-y-3">
              {project.decisions.map((decision) => {
                const href = decisionHref(decision)
                return (
                  <li key={decision.id} className="space-y-0.5">
                    <p className="text-sm">
                      {href ? (
                        <Link href={href} className="font-mono text-xs hover:text-primary">
                          {decision.id}
                        </Link>
                      ) : (
                        <span className="font-mono text-xs">{decision.id}</span>
                      )}{' '}
                      <span className="font-medium">
                        {decision.title ?? 'Não está no handbook'}
                      </span>
                    </p>
                    {decision.detail ? (
                      <p className="text-xs text-muted-foreground">
                        <InlineText text={decision.detail} />
                      </p>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : (
            <Quiet text="Nenhuma decisão ligada." />
          )}
        </Section>

        <Section icon={TriangleAlert} title="Riscos" description="Riscos declarados no catálogo.">
          {project.risks.length ? (
            <ul className="space-y-3">
              {project.risks.map((risk) => {
                const severity = RISK_SEVERITY[risk.severity]
                return (
                  <li key={risk.title} className="space-y-1">
                    <div className="flex items-start gap-2">
                      <ToneBadge tone={severity.tone}>{severity.label}</ToneBadge>
                      <span className="text-sm font-medium">{risk.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {risk.mitigation ?? 'Sem mitigação definida.'}
                    </p>
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState
              icon={TriangleAlert}
              title="Nenhum risco cadastrado"
              description="Riscos entram no arquivo do projeto em catalog/projects."
            />
          )}
        </Section>
      </div>
    </>
  )
}
