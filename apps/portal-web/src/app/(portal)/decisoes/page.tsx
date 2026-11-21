import { ListTodo } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { ToneBadge } from '@/components/status-badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { InlineText } from '@/components/inline-text'
import { api } from '@/lib/api'
import { groupBy } from '@/lib/utils'

export const metadata: Metadata = { title: 'Decisões pendentes' }

const PRIORITY: Record<number, { title: string; description: string }> = {
  1: { title: 'Prioridade 1', description: 'Segurança, dados pessoais e travas de merge.' },
  2: { title: 'Prioridade 2', description: 'Fluxo de engenharia, CI e documentação.' },
  3: { title: 'Prioridade 3', description: 'Detalhes de ferramenta, tagueamento, CRO e IA.' },
}

export default async function DecisionsPage() {
  const decisions = await api.decisions()
  const byPriority = groupBy(decisions, (decision) => decision.priority)

  return (
    <>
      <PageHeader
        title="Decisões pendentes"
        description="Conflitos e lacunas que viram pauta do time. Cada decisão atualiza o padrão e marca as páginas antigas como obsoletas."
      />
      {decisions.length ? (
        [...byPriority.entries()]
          .sort(([a], [b]) => a - b)
          .map(([priority, items]) => (
            <Card key={priority}>
              <CardHeader>
                <CardTitle>
                  {PRIORITY[priority]?.title ?? `Prioridade ${priority}`}{' '}
                  <span className="font-normal text-muted-foreground tabular-nums">
                    ({items.length})
                  </span>
                </CardTitle>
                <CardDescription>{PRIORITY[priority]?.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {items.map((decision) => (
                    <li
                      key={decision.id}
                      className="grid gap-2 py-3 sm:grid-cols-[7rem_1fr_auto] sm:items-start sm:gap-4"
                    >
                      <Link
                        href={`/padroes/${decision.id}`}
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        {decision.id}
                      </Link>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">
                          <InlineText text={decision.topic} />
                        </p>
                        <p className="text-sm text-muted-foreground">
                          <InlineText text={decision.question} />
                        </p>
                      </div>
                      <ToneBadge tone={decision.kind === 'Conflito' ? 'warning' : 'danger'}>
                        {decision.kind}
                      </ToneBadge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))
      ) : (
        <EmptyState
          icon={ListTodo}
          title="Nada pendente"
          description="Todos os padrões têm decisão."
        />
      )}
    </>
  )
}
