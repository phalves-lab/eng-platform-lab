import { DatabaseZap, ScrollText, ShieldX } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { ToneBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api, ApiError } from '@/lib/api'
import {
  actionLabel,
  AUDIT_KINDS,
  AUDIT_OUTCOMES,
  AUDIT_PATH,
  type AuditSearchParams,
  auditFilter,
  KIND_LABEL,
  nextPageHref,
  OUTCOME_LABEL,
  OUTCOME_TONE,
} from '@/lib/audit'
import { formatDateTime } from '@/lib/labels'

export const metadata: Metadata = { title: 'Auditoria' }

const selectClass =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30'

interface AuditPageProps {
  readonly searchParams: Promise<AuditSearchParams>
}

const loadTrail = async (params: AuditSearchParams) => {
  try {
    return { kind: 'ok' as const, page: await api.audit(auditFilter(params)) }
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) return { kind: 'denied' as const }
    if (error instanceof ApiError && error.status === 503) return { kind: 'unavailable' as const }
    throw error
  }
}

function Field({
  label,
  children,
}: {
  readonly label: string
  readonly children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

export default async function AuditPage({ searchParams }: AuditPageProps) {
  const params = await searchParams
  const result = await loadTrail(params)
  const header = (
    <PageHeader
      title="Auditoria"
      description="Quem fez o quê, quando e com qual resultado: toda escrita do portal e toda leitura de dados de time ou de outra pessoa."
    />
  )

  if (result.kind === 'denied') {
    return (
      <>
        {header}
        <EmptyState
          icon={ShieldX}
          title="Só administradores veem a auditoria"
          description="O seu papel no portal não inclui esta área. A tentativa de acesso também fica registrada."
        />
      </>
    )
  }
  if (result.kind === 'unavailable') {
    return (
      <>
        {header}
        <EmptyState
          icon={DatabaseZap}
          title="A auditoria precisa do banco"
          description="Sem DATABASE_URL a portal-api não grava nem lê a trilha. Suba o Postgres e configure a API."
        />
      </>
    )
  }

  const { entries, nextBefore } = result.page
  return (
    <>
      {header}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Datas em dias inteiros no horário de Brasília.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={AUDIT_PATH} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Pessoa">
              <Input name="pessoa" defaultValue={params.pessoa} placeholder="login exato" />
            </Field>
            <Field label="Ação">
              <Input name="acao" defaultValue={params.acao} placeholder="trecho, ex.: releases" />
            </Field>
            <Field label="Tipo">
              <select name="tipo" defaultValue={params.tipo ?? ''} className={selectClass}>
                <option value="">Todos</option>
                {AUDIT_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {KIND_LABEL[kind]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Resultado">
              <select
                name="resultado"
                defaultValue={params.resultado ?? ''}
                className={selectClass}
              >
                <option value="">Todos</option>
                {AUDIT_OUTCOMES.map((outcome) => (
                  <option key={outcome} value={outcome}>
                    {OUTCOME_LABEL[outcome]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="De">
              <Input type="date" name="de" defaultValue={params.de} />
            </Field>
            <Field label="Até">
              <Input type="date" name="ate" defaultValue={params.ate} />
            </Field>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
              <Button type="submit">Filtrar</Button>
              <Button asChild variant="outline">
                <Link href={AUDIT_PATH}>Limpar</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Eventos</CardTitle>
          <CardDescription>
            Mais recentes primeiro. Releases apontam para o registro próprio de release, sem copiar
            o plano.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {entries.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Pessoa</TableHead>
                    <TableHead className="min-w-48">Ação</TableHead>
                    <TableHead>Alvo</TableHead>
                    <TableHead>Resultado</TableHead>
                    <TableHead>Rede</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {formatDateTime(entry.at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium break-all">{entry.actor}</span>
                          <span className="text-xs text-muted-foreground">{entry.role}</span>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <div className="flex flex-col gap-0.5">
                          <span>{actionLabel(entry.action)}</span>
                          <span className="font-mono text-xs break-all text-muted-foreground">
                            {entry.action}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {KIND_LABEL[entry.kind]}
                            {entry.releaseRunId ? ` · release #${entry.releaseRunId}` : ''}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs break-all whitespace-normal">
                        {entry.target ?? '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <ToneBadge tone={OUTCOME_TONE[entry.outcome]}>
                            {OUTCOME_LABEL[entry.outcome]}
                          </ToneBadge>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {entry.status}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{entry.ipPrefix ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyState
              icon={ScrollText}
              title="Nenhum evento com esses filtros"
              description="Toda escrita e toda leitura de dados de time aparecem aqui assim que acontecem."
            />
          )}
          {nextBefore ? (
            <div className="mt-4 flex justify-end">
              <Button asChild variant="outline" size="sm">
                <Link href={nextPageHref(params, nextBefore)}>Mais antigos</Link>
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </>
  )
}
