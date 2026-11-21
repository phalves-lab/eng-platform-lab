import { Languages, Search } from 'lucide-react'
import type { Metadata } from 'next'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { groupBy } from '@/lib/utils'

export const metadata: Metadata = { title: 'Glossário' }

interface GlossaryProps {
  readonly searchParams: Promise<{ termo?: string }>
}

const initialOf = (term: string) =>
  term.normalize('NFD').replace(/[̀-ͯ]/g, '').charAt(0).toUpperCase()

export default async function GlossaryPage({ searchParams }: GlossaryProps) {
  const { termo } = await searchParams
  const entries = await api.glossary(termo)
  const byLetter = groupBy(
    [...entries].sort((a, b) => a.term.localeCompare(b.term, 'pt-BR')),
    (entry) => initialOf(entry.term),
  )

  return (
    <>
      <PageHeader
        title="Glossário"
        description="Siglas, métricas e termos de negócio como o time usa."
        actions={
          <form action="/glossario" className="flex w-full gap-2 sm:w-80" role="search">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                name="termo"
                defaultValue={termo}
                placeholder="Termo ou sigla"
                aria-label="Buscar termo"
                className="pl-8"
              />
            </div>
            <Button type="submit" variant="secondary">
              Buscar
            </Button>
          </form>
        }
      />
      {entries.length ? (
        <div className="space-y-8">
          {[...byLetter.entries()].map(([letter, items]) => (
            <section
              key={letter}
              aria-label={`Letra ${letter}`}
              className="grid gap-4 md:grid-cols-[3rem_1fr]"
            >
              <h3 className="text-2xl font-semibold text-primary">{letter}</h3>
              <dl className="divide-y rounded-xl border bg-card">
                {items.map((entry) => (
                  <div
                    key={entry.term}
                    className="grid gap-1 p-4 sm:grid-cols-[14rem_1fr] sm:gap-4"
                  >
                    <dt className="font-medium">{entry.term}</dt>
                    <dd className="text-sm leading-relaxed text-muted-foreground">
                      {entry.definition}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Languages}
          title="Termo não encontrado"
          description="Tente a sigla ou parte do nome."
        />
      )}
    </>
  )
}
