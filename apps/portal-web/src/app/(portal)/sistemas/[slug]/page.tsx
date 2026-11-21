import { ArrowLeft, TriangleAlert } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { InlineText } from '@/components/inline-text'
import { ToneBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api, ApiError } from '@/lib/api'
import { splitSystemName, systemStatus } from '@/lib/labels'
import { cn } from '@/lib/utils'

interface SystemProps {
  readonly params: Promise<{ slug: string }>
}

const HIDDEN = new Set(['O que é', 'Status'])
const RISK = /^riscos?/i
const WIDE = /^(riscos?|integra|fontes?)/i

export async function generateMetadata({ params }: SystemProps): Promise<Metadata> {
  const { slug } = await params
  const system = await api.system(slug).catch(() => null)
  return { title: system ? splitSystemName(system.name).title : slug }
}

export default async function SystemPage({ params }: SystemProps) {
  const { slug } = await params
  const system = await api.system(slug).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) notFound()
    throw error
  })
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
    </>
  )
}
