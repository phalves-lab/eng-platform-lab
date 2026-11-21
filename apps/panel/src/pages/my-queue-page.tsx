import type { PanelDataset, QueueRow } from '@lab/eng-metrics/contract'
import {
  CircleCheckBig,
  GitPullRequest,
  Inbox,
  MessageSquareReply,
  UserRoundSearch,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { EmptyState } from '@/components/empty-state'
import { KpiCard } from '@/components/kpi-card'
import { navItem } from '@/components/navigation'
import { PageHeader } from '@/components/page-header'
import { ChecksBadge, LevelBadge, SignalBadge, ToneBadge } from '@/components/status-badges'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useHashState } from '@/hooks/use-hash-state'
import { formatBusinessDays } from '@/lib/format'
import { buildMyQueue, listPeople } from '@/lib/my-queue'
import { readStoredPerson, storePerson } from '@/lib/person-storage'

const PrTitle = ({ row }: { readonly row: QueueRow }) => (
  <a
    href={row.url}
    target="_blank"
    rel="noreferrer"
    className="line-clamp-2 text-sm font-medium hover:underline"
  >
    <span className="text-muted-foreground">#{row.number}</span> {row.title}
  </a>
)

interface SectionProps {
  readonly title: string
  readonly description: string
  readonly empty: string
  readonly count: number
  readonly children: ReactNode
}

const Section = ({ title, description, empty, count, children }: SectionProps) => (
  <Card>
    <CardHeader>
      <CardTitle>{title}</CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
    <CardContent>
      {count ? (
        <ul className="divide-y">{children}</ul>
      ) : (
        <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <CircleCheckBig className="size-4 text-success" aria-hidden />
          {empty}
        </p>
      )}
    </CardContent>
  </Card>
)

export const MyQueuePage = ({ dataset }: { readonly dataset: PanelDataset }) => {
  const { person: personInLink, navigate } = useHashState()
  const people = listPeople(dataset)
  const candidate = personInLink ?? readStoredPerson()
  const person = candidate && people.includes(candidate) ? candidate : null
  const page = navItem('minha-fila')

  const choosePerson = (next: string) => {
    storePerson(next)
    navigate({ person: next })
  }

  const picker = (
    <Select value={person ?? ''} onValueChange={choosePerson}>
      <SelectTrigger className="sm:w-56" aria-label="Escolher quem é você">
        <SelectValue placeholder="Quem é você?" />
      </SelectTrigger>
      <SelectContent>
        {people.map((login) => (
          <SelectItem key={login} value={login}>
            {login}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  if (!person)
    return (
      <div className="space-y-6">
        <PageHeader title={page.title} description={page.description} actions={picker} />
        <EmptyState
          icon={UserRoundSearch}
          title="Escolha quem é você"
          description="Selecione seu usuário do GitHub no campo acima. O painel lembra a escolha neste navegador."
        />
      </div>
    )

  const queue = buildMyQueue(dataset.queue, person)

  return (
    <div className="space-y-6">
      <PageHeader title={page.title} description={page.description} actions={picker} />

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Para eu revisar"
          value={String(queue.toReview.length)}
          icon={Inbox}
          tone={
            queue.toReview.some((row) => row.level === 'atrasado') ? 'destructive' : 'secondary'
          }
          hint="Pedidos para você e ainda sem a sua review"
        />
        <KpiCard
          label="Meus PRs abertos"
          value={String(queue.mine.length)}
          icon={GitPullRequest}
          hint={`${queue.mine.filter((item) => item.status.needsAction).length} pedem ação sua`}
        />
        <KpiCard
          label="Ações pendentes"
          value={String(queue.actions)}
          icon={MessageSquareReply}
          tone={queue.actions ? 'warning' : 'success'}
          hint={queue.actions ? 'Reviews a fazer e PRs seus para mexer' : 'Nada esperando por você'}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section
          title="Para eu revisar"
          description="Na ordem da fila: comece pelo primeiro."
          empty="Nenhuma review pedida para você."
          count={queue.toReview.length}
        >
          {queue.toReview.map((row) => (
            <li key={row.number} className="flex items-start gap-3 py-3">
              <span className="w-8 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">
                {row.position}º
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <PrTitle row={row} />
                <p className="text-xs text-muted-foreground">
                  de {row.author} · {formatBusinessDays(row.ageBusinessDays)} na fila · {row.lines}{' '}
                  linhas
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <LevelBadge level={row.level} />
                  <SignalBadge signal={row.botSignal} />
                </div>
              </div>
              <Button asChild size="sm" variant="outline">
                <a href={row.url} target="_blank" rel="noreferrer">
                  Revisar
                </a>
              </Button>
            </li>
          ))}
        </Section>

        <Section
          title="Meus PRs"
          description="O que cada PR seu precisa agora."
          empty="Você não tem PR aberto aguardando review."
          count={queue.mine.length}
        >
          {queue.mine.map(({ row, status }) => (
            <li key={row.number} className="space-y-1.5 py-3">
              <div className="flex items-start justify-between gap-3">
                <PrTitle row={row} />
                <ToneBadge tone={status.tone} className="shrink-0">
                  {status.label}
                </ToneBadge>
              </div>
              <p className="text-xs text-muted-foreground">
                {status.hint} {formatBusinessDays(row.ageBusinessDays)} na fila.
              </p>
              <div className="flex flex-wrap gap-1.5">
                <ChecksBadge checks={row.checks} />
                <SignalBadge signal={row.botSignal} />
              </div>
            </li>
          ))}
        </Section>
      </div>

      {queue.reviewed.length ? (
        <Section
          title="Já revisei"
          description="PRs de outras pessoas com review sua, ainda abertos. Fique de olho nas respostas."
          empty=""
          count={queue.reviewed.length}
        >
          {queue.reviewed.map((row) => (
            <li key={row.number} className="flex items-center justify-between gap-3 py-2.5">
              <PrTitle row={row} />
              <span className="shrink-0 text-xs text-muted-foreground">de {row.author}</span>
            </li>
          ))}
        </Section>
      ) : null}
    </div>
  )
}
