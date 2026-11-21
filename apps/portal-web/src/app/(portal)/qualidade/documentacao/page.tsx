import type { DocReviewStatus } from '@lab/contracts'
import { CalendarClock, CircleCheckBig, FileWarning, UserRoundX } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { EmptyState } from '@/components/empty-state'
import { KpiCard } from '@/components/kpi-card'
import { PageHeader } from '@/components/page-header'
import { ToneBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDate } from '@/lib/labels'
import {
  DOC_STATUS_LABEL,
  DOC_STATUS_TONE,
  DOC_STATUSES,
  formatAge,
  formatMonths,
  formatOwner,
  isDocStatus,
  ownerSummary,
} from '@/lib/quality'
import { qualityApi } from '@/lib/quality-api'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Documentação' }

const BASE_PATH = '/qualidade/documentacao'
const chip = 'rounded-full border px-3 py-1 text-sm transition-colors hover:bg-muted'
const chipActive = 'border-primary bg-primary-light text-primary hover:bg-primary-light'

interface DocsProps {
  readonly searchParams: Promise<{ situacao?: string }>
}

export default async function DocsPage({ searchParams }: DocsProps) {
  const { situacao } = await searchParams
  const status = isDocStatus(situacao) ? situacao : undefined
  const report = await qualityApi.docs()
  const total = Object.values(report.counts).reduce((sum, count) => sum + count, 0)
  const owners = report.owners
    .map((group) => ({
      ...group,
      items: status ? group.items.filter((item) => item.status === status) : group.items,
    }))
    .filter((group) => group.items.length > 0)
  const href = (value?: DocReviewStatus) => (value ? `${BASE_PATH}?situacao=${value}` : BASE_PATH)

  return (
    <>
      <PageHeader
        title="Documentação"
        description={`Validade da revisão de cada arquivo e padrão do handbook, por dono. Vence ${formatMonths(report.maxAgeMonths)} depois da última revisão.`}
      />

      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Resumo da documentação"
      >
        <KpiCard
          label="Vencidos"
          value={report.counts.stale}
          icon={FileWarning}
          tone={report.counts.stale ? 'danger' : 'success'}
          hint={`Revisão com mais de ${formatMonths(report.maxAgeMonths)}`}
        />
        <KpiCard
          label="Vencem em breve"
          value={report.counts.expiring}
          icon={CalendarClock}
          tone={report.counts.expiring ? 'warning' : 'success'}
          hint="Nos próximos 30 dias"
        />
        <KpiCard
          label="Sem dono ou data"
          value={report.counts.missing}
          icon={UserRoundX}
          tone={report.counts.missing ? 'warning' : 'success'}
          hint="Campos dono e revisado_em"
        />
        <KpiCard
          label="Em dia"
          value={report.counts.ok}
          icon={CircleCheckBig}
          tone="success"
          hint={`De ${total} itens com revisão`}
        />
      </section>

      <nav aria-label="Filtrar por situação" className="flex flex-wrap gap-2">
        <Link
          href={href()}
          aria-current={status ? undefined : 'page'}
          className={cn(chip, !status && chipActive)}
        >
          Todos <span className="text-muted-foreground tabular-nums">{total}</span>
        </Link>
        {DOC_STATUSES.map((value) => (
          <Link
            key={value}
            href={href(value)}
            aria-current={status === value ? 'page' : undefined}
            className={cn(chip, status === value && chipActive)}
          >
            {DOC_STATUS_LABEL[value]}{' '}
            <span className="text-muted-foreground tabular-nums">{report.counts[value]}</span>
          </Link>
        ))}
      </nav>

      {owners.length ? (
        owners.map((group) => (
          <Card key={group.owner ?? 'sem-dono'}>
            <CardHeader>
              <CardTitle className="font-mono text-base break-all">
                {formatOwner(group.owner)}
              </CardTitle>
              <CardDescription>{ownerSummary(group.counts)}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-48">Documento</TableHead>
                      <TableHead>Revisado</TableHead>
                      <TableHead>Vence em</TableHead>
                      <TableHead>Situação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.items.map((item) => (
                      <TableRow key={`${item.kind}-${item.ref}`}>
                        <TableCell className="whitespace-normal">
                          <div className="flex flex-col gap-0.5">
                            {item.kind === 'standard' ? (
                              <Link
                                href={`/padroes/${encodeURIComponent(item.ref)}`}
                                className="font-medium hover:text-primary hover:underline"
                              >
                                {item.title}
                              </Link>
                            ) : (
                              <span className="font-medium">{item.title}</span>
                            )}
                            <span className="font-mono text-xs text-muted-foreground">
                              {item.kind === 'standard' ? `padrão em ${item.file}` : item.file}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="tabular-nums">
                              {item.reviewedAt ? formatDate(item.reviewedAt) : 'sem data'}
                            </span>
                            {item.reviewedAt ? (
                              <span className="text-xs text-muted-foreground">
                                {formatAge(item.ageDays)}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {item.dueAt ? formatDate(item.dueAt) : 'sem prazo'}
                        </TableCell>
                        <TableCell>
                          <ToneBadge tone={DOC_STATUS_TONE[item.status]}>
                            {DOC_STATUS_LABEL[item.status]}
                          </ToneBadge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ))
      ) : (
        <EmptyState
          icon={CircleCheckBig}
          title="Nada nessa situação"
          description="Nenhum arquivo ou padrão do handbook está nessa situação agora."
          action={
            <Button asChild variant="outline" size="sm">
              <Link href={BASE_PATH}>Ver todos</Link>
            </Button>
          }
        />
      )}
    </>
  )
}
