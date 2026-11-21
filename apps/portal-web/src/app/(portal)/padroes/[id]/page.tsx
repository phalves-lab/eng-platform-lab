import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ToneBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api, ApiError } from '@/lib/api'
import { STATUS_LABEL, STATUS_TONE } from '@/lib/labels'

interface StandardProps {
  readonly params: Promise<{ id: string }>
}

const FIELD_ORDER = ['Regra', 'Por quê', 'Na prática hoje', 'Fonte']

export async function generateMetadata({ params }: StandardProps): Promise<Metadata> {
  return { title: (await params).id }
}

export default async function StandardPage({ params }: StandardProps) {
  const { id } = await params
  const standard = await api.standard(id).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) notFound()
    throw error
  })
  const extra = Object.keys(standard.fields).filter(
    (key) => key !== 'Status' && !FIELD_ORDER.includes(key),
  )

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href="/padroes">
          <ArrowLeft aria-hidden />
          Padrões
        </Link>
      </Button>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-muted-foreground">{standard.id}</span>
          <ToneBadge tone={STATUS_TONE[standard.status]}>{STATUS_LABEL[standard.status]}</ToneBadge>
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">{standard.title}</h2>
        <p className="text-sm text-muted-foreground">{standard.area}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {standard.status === 'LACUNA' ? 'O que o time precisa decidir' : 'Regra'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base leading-relaxed">{standard.fields['Regra'] ?? standard.title}</p>
        </CardContent>
      </Card>
      <dl className="grid gap-4 md:grid-cols-2">
        {[...FIELD_ORDER.slice(1), ...extra]
          .filter((key) => standard.fields[key])
          .map((key) => (
            <div key={key} className="rounded-xl border bg-card p-4">
              <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {key}
              </dt>
              <dd className="mt-2 text-sm leading-relaxed">{standard.fields[key]}</dd>
            </div>
          ))}
      </dl>
    </>
  )
}
