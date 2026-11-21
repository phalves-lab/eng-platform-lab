import { Languages, Search } from 'lucide-react'
import type { Metadata } from 'next'
import { EmptyState } from '@/components/empty-state'
import { InlineText } from '@/components/inline-text'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { splitSource } from '@/lib/labels'
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
          <nav
            aria-label="Letras do glossário"
            className="sticky top-0 z-10 -mx-1 flex flex-wrap gap-1 bg-background/95 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80"
          >
            {[...byLetter.keys()].map((letter) => (
              <a
                key={letter}
                href={`#letra-${letter}`}
                className="flex size-8 items-center justify-center rounded-md text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {letter}
              </a>
            ))}
          </nav>
          {[...byLetter.entries()].map(([letter, items]) => (
            <section
              key={letter}
              id={`letra-${letter}`}
              aria-label={`Letra ${letter}`}
              className="grid scroll-mt-16 gap-4 md:grid-cols-[3rem_1fr]"
            >
              <h3 className="text-2xl font-semibold text-primary">{letter}</h3>
              <dl className="divide-y rounded-xl border bg-card">
                {items.map((entry) => {
                  const { body, source } = splitSource(entry.definition)
                  return (
                    <div
                      key={entry.term}
                      className="grid gap-1 p-4 sm:grid-cols-[14rem_1fr] sm:gap-4"
                    >
                      <dt className="font-medium break-words">{entry.term}</dt>
                      <dd className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
                        <p>
                          <InlineText text={body} />
                        </p>
                        {source ? (
                          <p className="text-xs text-muted-foreground/80">Fonte: {source}</p>
                        ) : null}
                      </dd>
                    </div>
                  )
                })}
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
