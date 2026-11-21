import type { TeamWorkResponse } from '@lab/contracts'
import { DatabaseZap, Users } from 'lucide-react'
import Link from 'next/link'
import { EmptyState } from '@/components/empty-state'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TaskList } from '@/components/work/task-list'
import { TeamLoad } from '@/components/work/team-load'
import { cn } from '@/lib/utils'
import { homeHref, jiraNotice, staleHint } from '@/lib/work'

interface TeamSectionProps {
  readonly team: TeamWorkResponse
  readonly dataset: string | undefined
  readonly login: string
}

export function TeamSection({ team, dataset, login }: TeamSectionProps) {
  const notice = team.jira.state === 'unavailable' ? jiraNotice(team.jira.reason, login) : null
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4 text-primary" aria-hidden />
            Meu time · {team.team.name}
          </CardTitle>
          <CardDescription>
            Carga de cada pessoa, em ordem alfabética. Serve para equilibrar o trabalho, não para
            comparar ninguém.
          </CardDescription>
        </div>
        {team.teams.length > 1 ? (
          <nav aria-label="Time" className="inline-flex flex-wrap rounded-lg border bg-card p-1">
            {team.teams.map((option) => (
              <Link
                key={option.id}
                href={homeHref({ dataset, team: option.id })}
                aria-current={option.id === team.team.id ? 'page' : undefined}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
                  option.id === team.team.id &&
                    'bg-primary text-primary-foreground hover:text-primary-foreground',
                )}
              >
                {option.name}
              </Link>
            ))}
          </nav>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        <section aria-label="Carga por pessoa">
          <h3 className="text-sm font-medium">Carga por pessoa</h3>
          <TeamLoad members={team.members} />
        </section>
        <section aria-label="Itens parados do time">
          <h3 className="text-sm font-medium">Itens parados</h3>
          <p className="text-xs text-muted-foreground">{staleHint(team.staleAfterBusinessDays)}</p>
          {team.jira.state === 'ready' ? (
            <TaskList items={team.jira.staleItems} empty="Nenhum item do time está parado." />
          ) : null}
          {notice ? (
            <div className="pt-3">
              <EmptyState
                icon={DatabaseZap}
                title={notice.title}
                description={notice.description}
              />
            </div>
          ) : null}
        </section>
      </CardContent>
    </Card>
  )
}
