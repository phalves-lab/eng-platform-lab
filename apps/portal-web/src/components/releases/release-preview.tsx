import type { ReleaseDeployOrder, ReleaseSideFilter } from '@lab/contracts'
import { CloudOff, Database, GitPullRequest, ListChecks, Users } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { KpiCard } from '@/components/kpi-card'
import { ReleaseSide } from '@/components/releases/release-side'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiError } from '@/lib/api'
import { previewTotals, shortList, SIDE_LABEL } from '@/lib/releases'
import { releasesApi } from '@/lib/releases-api'
import { cn } from '@/lib/utils'

interface ReleasePreviewProps {
  readonly project: string
  readonly side: ReleaseSideFilter
  readonly source: string
  readonly target: string
}

function DeployOrder({ order }: { readonly order: ReleaseDeployOrder }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ordem de deploy</CardTitle>
        <CardDescription>
          {order.reason === 'migration'
            ? 'O back sobe primeiro porque traz migration: o front novo depende do banco já migrado.'
            : 'Ordem padrão cadastrada para o projeto.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-wrap items-center gap-2 text-sm">
          {order.sides.map((side, index) => (
            <li key={side} className="flex items-center gap-2">
              {index > 0 ? (
                <span className="text-muted-foreground" aria-hidden>
                  →
                </span>
              ) : null}
              <span className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 font-medium">
                <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                  {index + 1}
                </span>
                {SIDE_LABEL[side]}
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

export function ReleasePreviewSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando a prévia">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </div>
  )
}

export async function ReleasePreview({ project, side, source, target }: ReleasePreviewProps) {
  let preview
  try {
    preview = await releasesApi.preview({ project, side, source, target })
  } catch (error) {
    if (!(error instanceof ApiError)) throw error
    return (
      <EmptyState
        icon={CloudOff}
        title={
          error.status === 404
            ? 'Branch ou repositório não encontrado'
            : 'Não foi possível montar a prévia'
        }
        description={error.message}
      />
    )
  }

  const totals = previewTotals(preview)
  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Resumo da release">
        <KpiCard
          label="PRs"
          value={totals.pulls}
          icon={GitPullRequest}
          hint={totals.pulls ? `Mergeados desde o último corte` : 'Nada mergeado desde o corte'}
        />
        <KpiCard
          label="Tickets"
          value={totals.tickets}
          icon={ListChecks}
          hint={totals.multiple ? `${totals.multiple} com mais de um PR` : 'Um PR por ticket'}
        />
        <KpiCard
          label="SQL e ENV"
          value={`${totals.sql} · ${totals.env}`}
          icon={Database}
          tone={totals.sql + totals.env ? 'warning' : 'default'}
          hint="Tickets com SQL · com ENV"
        />
        <KpiCard
          label="Autores"
          value={totals.authors.length}
          icon={Users}
          hint={totals.authors.length ? shortList(totals.authors) : 'Nenhum autor humano'}
        />
      </section>

      {preview.deployOrder ? <DeployOrder order={preview.deployOrder} /> : null}

      <div className={cn('grid gap-6', preview.sides.length > 1 && 'xl:grid-cols-2')}>
        {preview.sides.map((item) => (
          <ReleaseSide key={item.side} side={item} />
        ))}
      </div>
    </div>
  )
}
