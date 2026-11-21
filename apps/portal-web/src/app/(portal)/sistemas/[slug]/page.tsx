import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, Package, TriangleAlert } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { InlineText } from '@/components/inline-text'
import { SystemEvents } from '@/components/systems/system-events'
import { ToneBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api, ApiError } from '@/lib/api'
import { splitSystemName, systemStatus } from '@/lib/labels'
import { cn } from '@/lib/utils'

interface SystemProps {
  readonly params: Promise<{ slug: string }>
}

const HIDDEN = new Set(['O que é', 'Status', 'Dono'])
const RISK = /^riscos?/i
const WIDE = /^(riscos?|integra|fontes?)/i

export async function generateMetadata({ params }: SystemProps): Promise<Metadata> {
  const { slug } = await params
  const system = await api.system(slug).catch(() => null)
  return { title: system ? splitSystemName(system.name).title : slug }
}

export default async function SystemPage({ params }: SystemProps) {
  const { slug } = await params
  const [system, relations] = await Promise.all([
    api.system(slug).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) notFound()
      throw error
    }),
    api.systemRelations(slug).catch(() => null),
  ])
  const owner = relations?.owner ?? system.fields['Dono'] ?? null
  const { title, repo } = splitSystemName(system.name)
  const status = systemStatus(system.status)
  const fields = Object.entries(system.fields).filter(([key]) => !HIDDEN.has(key))

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/sistemas">
          <ArrowLeft aria-hidden />
          Sistemas
        </Link>
      </Button>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{system.layer}</Badge>
          {status ? <ToneBadge tone={status.tone}>{status.label}</ToneBadge> : null}
          {status?.detail ? (
            <span className="text-xs text-muted-foreground">
              <InlineText text={status.detail} />
            </span>
          ) : null}
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        {repo ? <p className="font-mono text-sm text-muted-foreground">{repo}</p> : null}
        <p className="max-w-3xl text-base leading-relaxed text-muted-foreground">
          <InlineText text={system.summary} />
        </p>
        <p className="text-sm">
          <span className="text-muted-foreground">Dono: </span>
          <span className="font-medium">
            {owner ? <InlineText text={owner} /> : 'sem dono na ficha'}
          </span>
        </p>
      </div>
      <dl className="grid gap-4 md:grid-cols-2">
        {fields.map(([key, value]) => {
          const risk = RISK.test(key)
          return (
            <div
              key={key}
              className={cn(
                'rounded-xl border bg-card p-4',
                WIDE.test(key) && 'md:col-span-2',
                risk && 'border-warning/40 bg-warning-light/50',
              )}
            >
              <dt
                className={cn(
                  'flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase',
                  risk && 'text-warning-dark',
                )}
              >
                {risk ? <TriangleAlert className="size-3.5" aria-hidden /> : null}
                {key}
              </dt>
              <dd className="mt-2 text-sm leading-relaxed break-words">
                <InlineText text={value} />
              </dd>
            </div>
          )
        })}
      </dl>
      {relations ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ArrowUpFromLine className="size-4 text-primary" aria-hidden />
                Eventos produzidos
              </CardTitle>
              <CardDescription>Tópicos que este sistema publica e quem consome.</CardDescription>
            </CardHeader>
            <CardContent>
              <SystemEvents
                events={relations.produces}
                peerLabel="Consomem"
                empty="Não produz eventos nos contratos do handbook."
              />
            </CardContent>
          </Card>
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ArrowDownToLine className="size-4 text-primary" aria-hidden />
                Eventos consumidos
              </CardTitle>
              <CardDescription>Tópicos que este sistema escuta e quem produz.</CardDescription>
            </CardHeader>
            <CardContent>
              <SystemEvents
                events={relations.consumes}
                peerLabel="Produz"
                empty="Não consome eventos nos contratos do handbook."
              />
            </CardContent>
          </Card>
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="size-4 text-primary" aria-hidden />
                Módulo do catálogo
              </CardTitle>
              <CardDescription>Dono, tier e caminhos em catalog/modules.</CardDescription>
            </CardHeader>
            <CardContent>
              {relations.module ? (
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Módulo</dt>
                    <dd className="font-mono text-xs">{relations.module.name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Dono e tier</dt>
                    <dd>
                      {relations.module.owner} · {relations.module.tier}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Caminhos</dt>
                    <dd className="font-mono text-xs break-all">
                      {relations.module.paths.join(', ') || 'nenhum'}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {relations.moduleId
                    ? `A ficha cita o módulo ${relations.moduleId}, que não está em catalog/modules.`
                    : 'A ficha não cita módulo do catálogo nas fontes.'}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  )
}
