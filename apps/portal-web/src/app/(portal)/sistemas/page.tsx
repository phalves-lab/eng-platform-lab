import { Boxes, Search } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { groupBy } from '@/lib/utils'

export const metadata: Metadata = { title: 'Sistemas' }

interface SystemsProps {
  readonly searchParams: Promise<{ termo?: string }>
}

export default async function SystemsPage({ searchParams }: SystemsProps) {
  const { termo } = await searchParams
  const systems = await api.systems(termo)
  const byLayer = groupBy(systems, (system) => system.layer || 'Outros')

  return (
    <>
      <PageHeader
        title="Sistemas"
        description="O que existe, quem é dono, com o que integra e quais riscos já são conhecidos."
        actions={
          <form action="/sistemas" className="flex w-full gap-2 sm:w-80" role="search">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                name="termo"
                defaultValue={termo}
                placeholder="Tecnologia, integração ou nome"
                aria-label="Buscar sistemas"
                className="pl-8"
              />
            </div>
            <Button type="submit" variant="secondary">
              Buscar
            </Button>
          </form>
        }
      />
      {systems.length ? (
        [...byLayer.entries()].map(([layer, items]) => (
          <section key={layer} className="space-y-3">
            <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              {layer} <span className="font-normal tabular-nums">({items.length})</span>
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((system) => (
                <Link key={system.slug} href={`/sistemas/${system.slug}`} className="group">
                  <Card className="h-full gap-3 transition-colors group-hover:border-primary/60">
                    <CardHeader>
                      <CardTitle className="line-clamp-1 text-base">{system.name}</CardTitle>
                      <CardDescription className="line-clamp-3">{system.summary}</CardDescription>
                      {system.status ? (
                        <p className="pt-1 text-xs text-muted-foreground line-clamp-1">
                          {system.status}
                        </p>
                      ) : null}
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))
      ) : (
        <EmptyState
          icon={Boxes}
          title="Nenhum sistema cita esse termo"
          description="Tente o nome de uma tecnologia, como Pub/Sub ou Postgres."
        />
      )}
    </>
  )
}
