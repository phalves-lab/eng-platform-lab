import {
  BookCheck,
  CircleCheckBig,
  GitPullRequest,
  Inbox,
  ListTodo,
  MessageSquareReply,
} from 'lucide-react'
import Link from 'next/link'
import { EmptyState } from '@/components/empty-state'
import { KpiCard } from '@/components/kpi-card'
import { PageHeader } from '@/components/page-header'
import { DatasetSwitch } from '@/components/review/dataset-switch'
import { PrLink } from '@/components/review/pr-link'
import { ToneBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api'
import { formatBusinessDays, LEVEL_LABEL, LEVEL_TONE, PR_TONE } from '@/lib/labels'

interface HomeProps {
  readonly searchParams: Promise<{ conjunto?: string; pessoa?: string }>
}

export default async function HomePage({ searchParams }: HomeProps) {
  const { conjunto = 'lab', pessoa } = await searchParams
  const [user, datasets, overview, decisions] = await Promise.all([
    api.me(),
    api.datasets(),
    api.overview(),
    api.decisions(1),
  ])
  const dataset = datasets.some((d) => d.id === conjunto) ? conjunto : (datasets[0]?.id ?? 'lab')
  const queue = await api.myReview(dataset, pessoa)
  const pendingMine = queue.mine.filter((item) => item.status.needsAction).length

  return (
    <>
      <PageHeader
        title={`Olá, ${user.name}`}
        description="O que espera por você agora: reviews pedidas, seus PRs e o que o time precisa decidir."
        actions={<DatasetSwitch basePath="/" current={dataset} datasets={datasets} />}
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Resumo">
        <KpiCard
          label="Para eu revisar"
          value={queue.toReview.length}
          icon={Inbox}
          tone={queue.toReview.some((row) => row.level === 'atrasado') ? 'danger' : 'default'}
          hint="Reviews pedidas para você"
        />
        <KpiCard
          label="Meus PRs abertos"
          value={queue.mine.length}
          icon={GitPullRequest}
          hint={`${pendingMine} pedem ação sua`}
        />
        <KpiCard
          label="Ações pendentes"
          value={queue.actions}
          icon={MessageSquareReply}
          tone={queue.actions ? 'warning' : 'success'}
          hint={queue.actions ? 'Reviews e ajustes esperando você' : 'Nada esperando por você'}
        />
        <KpiCard
          label="Padrões vigentes"
          value={overview.standards.VIGENTE}
          icon={BookCheck}
          hint={`${overview.standards.CONFLITO + overview.standards.LACUNA} em conflito ou lacuna`}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Para eu revisar</CardTitle>
            <CardDescription>Na ordem da fila: comece pelo primeiro.</CardDescription>
          </CardHeader>
          <CardContent>
            {queue.toReview.length ? (
              <ul className="divide-y">
                {queue.toReview.map((row) => (
                  <li key={row.number} className="flex items-start gap-3 py-3">
                    <span className="w-8 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">
                      {row.position}º
                    </span>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <PrLink row={row} />
                      <p className="text-xs text-muted-foreground">
                        de {row.author} · {formatBusinessDays(row.ageBusinessDays)} na fila ·{' '}
                        {row.lines} linhas
                      </p>
                    </div>
                    <ToneBadge tone={LEVEL_TONE[row.level]}>{LEVEL_LABEL[row.level]}</ToneBadge>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={CircleCheckBig}
                title="Nenhuma review pedida para você"
                description="Quando alguém pedir sua review, ela aparece aqui na ordem da fila."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Meus PRs</CardTitle>
            <CardDescription>A próxima ação de cada PR seu.</CardDescription>
          </CardHeader>
          <CardContent>
            {queue.mine.length ? (
              <ul className="divide-y">
                {queue.mine.map(({ row, status }) => (
                  <li key={row.number} className="space-y-1.5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <PrLink row={row} />
                      <ToneBadge tone={PR_TONE[status.tone]}>{status.label}</ToneBadge>
                    </div>
                    <p className="text-xs text-muted-foreground">{status.hint}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={GitPullRequest}
                title="Nenhum PR seu aberto"
                description="Seus PRs abertos aparecem aqui com o que cada um precisa."
              />
            )}
          </CardContent>
        </Card>
      </div>

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
                  <p className="mt-1 text-sm font-medium">{decision.topic}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {decision.question}
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
