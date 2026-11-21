import type { StandardStatus } from '@lab/contracts'
import { BookCheck, Search } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { ToneBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { STATUS_LABEL, STATUS_TONE } from '@/lib/labels'
import { cn, groupBy } from '@/lib/utils'

export const metadata: Metadata = { title: 'Padrões' }

const STATUSES: StandardStatus[] = ['VIGENTE', 'CONFLITO', 'PROPOSTO', 'LACUNA']

interface StandardsProps {
  readonly searchParams: Promise<{ termo?: string; status?: string }>
}

const isStatus = (value: string | undefined): value is StandardStatus =>
  STATUSES.includes(value as StandardStatus)

export default async function StandardsPage({ searchParams }: StandardsProps) {
  const { termo, status } = await searchParams
  const statusFilter = isStatus(status) ? status : undefined
  const [standards, overview] = await Promise.all([
    api.standards({
      ...(termo ? { term: termo } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
    }),
    api.overview(),
  ])
  const byArea = groupBy(standards, (standard) => standard.area)
  const statusHref = (value?: StandardStatus) => {
    const params = new URLSearchParams()
    if (termo) params.set('termo', termo)
    if (value) params.set('status', value)
    const text = params.toString()
    return text ? `/padroes?${text}` : '/padroes'
  }

  return (
    <>
      <PageHeader
        title="Padrões"
        description="Como o time desenvolve. Cada regra tem um ID estável para ser citada no review, no CI e pela IA."
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Filtrar por status" className="flex flex-wrap gap-2">
          <Link
            href={statusHref()}
            className={cn(
              'rounded-full border px-3 py-1 text-sm',
              !statusFilter && 'border-primary bg-primary-light text-primary',
            )}
          >
            Todos
          </Link>
          {STATUSES.map((value) => (
            <Link
              key={value}
              href={statusHref(value)}
              aria-current={statusFilter === value ? 'page' : undefined}
              className={cn(
                'rounded-full border px-3 py-1 text-sm',
                statusFilter === value && 'border-primary bg-primary-light text-primary',
              )}
            >
              {STATUS_LABEL[value]}{' '}
              <span className="tabular-nums text-muted-foreground">
                {overview.standards[value]}
              </span>
            </Link>
          ))}
        </nav>
        <form action="/padroes" className="flex w-full gap-2 lg:w-80" role="search">
          {statusFilter ? <input type="hidden" name="status" value={statusFilter} /> : null}
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              name="termo"
              defaultValue={termo}
              placeholder="Buscar nos padrões"
              aria-label="Buscar nos padrões"
              className="pl-8"
            />
          </div>
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
        </form>
      </div>

      {standards.length ? (
        <div className="space-y-6">
          {[...byArea.entries()].map(([area, items]) => (
            <Card key={area}>
              <CardHeader>
                <CardTitle className="text-base">{area}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {items.map((standard) => (
                    <li key={standard.id}>
                      <Link
                        href={`/padroes/${standard.id}`}
                        className="flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-muted"
                      >
                        <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">
                          {standard.id}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm">{standard.title}</span>
                        <ToneBadge tone={STATUS_TONE[standard.status]}>
                          {STATUS_LABEL[standard.status]}
                        </ToneBadge>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={BookCheck}
          title="Nenhum padrão com esses filtros"
          description="Tente outra palavra ou remova o filtro de status."
        />
      )}
    </>
  )
}
