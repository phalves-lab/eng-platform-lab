import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api, ApiError } from '@/lib/api'

interface SystemProps {
  readonly params: Promise<{ slug: string }>
}

const HIDDEN = new Set(['O que é'])

export async function generateMetadata({ params }: SystemProps): Promise<Metadata> {
  return { title: (await params).slug }
}

export default async function SystemPage({ params }: SystemProps) {
  const { slug } = await params
  const system = await api.system(slug).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) notFound()
    throw error
  })
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
        <Badge variant="outline">{system.layer}</Badge>
        <h2 className="text-2xl font-semibold tracking-tight">{system.name}</h2>
        <p className="max-w-3xl text-base leading-relaxed text-muted-foreground">
          {system.summary}
        </p>
      </div>
      <dl className="grid gap-4 md:grid-cols-2">
        {fields.map(([key, value]) => (
          <div key={key} className="rounded-xl border bg-card p-4">
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {key}
            </dt>
            <dd className="mt-2 text-sm leading-relaxed break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </>
  )
}
