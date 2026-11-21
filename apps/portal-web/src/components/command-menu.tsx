'use client'

import { BookCheck, Boxes, Languages, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { NAV_GROUPS } from '@/components/navigation'
import { Button } from '@/components/ui/button'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

interface SearchResult {
  standards: { id: string; title: string }[]
  systems: { slug: string; name: string; layer: string }[]
  terms: { term: string; definition: string }[]
}

const EMPTY: SearchResult = { standards: [], systems: [], terms: [] }

export function CommandMenu() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [result, setResult] = useState<SearchResult>(EMPTY)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (term.trim().length < 2) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then((response) => (response.ok ? (response.json() as Promise<SearchResult>) : EMPTY))
        .then(setResult)
        .catch(() => undefined)
    }, 200)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [term])

  const go = useCallback(
    (href: string) => {
      setOpen(false)
      router.push(href)
    },
    [router],
  )

  const visible = term.trim().length < 2 ? EMPTY : result

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8 w-8 gap-2 px-0 text-muted-foreground sm:w-72 sm:justify-start sm:px-2.5"
        onClick={() => setOpen(true)}
        aria-label="Buscar no portal"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="hidden min-w-0 truncate font-normal sm:inline">
          Buscar padrão, sistema ou termo
        </span>
        <kbd className="pointer-events-none ml-auto hidden h-5 shrink-0 items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium sm:inline-flex">
          Ctrl K
        </kbd>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Buscar no portal"
        shouldFilter={false}
      >
        <CommandInput
          placeholder="Digite um ID, sistema, termo ou página"
          value={term}
          onValueChange={setTerm}
        />
        <CommandList>
          <CommandEmpty>Nada encontrado.</CommandEmpty>
          {term.trim().length < 2 ? (
            <CommandGroup heading="Páginas">
              {NAV_GROUPS.flatMap((group) => group.items).map((item) => (
                <CommandItem key={item.href} value={item.href} onSelect={() => go(item.href)}>
                  <item.icon aria-hidden />
                  {item.title}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {visible.standards.length ? (
            <CommandGroup heading="Padrões">
              {visible.standards.map((standard) => (
                <CommandItem
                  key={standard.id}
                  value={standard.id}
                  onSelect={() => go(`/padroes/${standard.id}`)}
                >
                  <BookCheck aria-hidden />
                  <span className="font-mono text-xs text-muted-foreground">{standard.id}</span>
                  <span className="truncate">{standard.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {visible.systems.length ? (
            <CommandGroup heading="Sistemas">
              {visible.systems.map((system) => (
                <CommandItem
                  key={system.slug}
                  value={system.slug}
                  onSelect={() => go(`/sistemas/${system.slug}`)}
                >
                  <Boxes aria-hidden />
                  <span className="truncate">{system.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{system.layer}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {visible.terms.length ? (
            <CommandGroup heading="Glossário">
              {visible.terms.map((entry) => (
                <CommandItem
                  key={entry.term}
                  value={entry.term}
                  onSelect={() => go(`/glossario?termo=${encodeURIComponent(entry.term)}`)}
                >
                  <Languages aria-hidden />
                  <span className="truncate">{entry.term}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
        </CommandList>
      </CommandDialog>
    </>
  )
}
