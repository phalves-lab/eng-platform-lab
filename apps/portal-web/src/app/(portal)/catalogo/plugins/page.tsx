import type { PluginMaturity } from '@lab/contracts'
import { Puzzle, Search, UserRound } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { CatalogUnavailable } from '@/components/catalog/catalog-unavailable'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { ToneBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api } from '@/lib/api'
import { whenAvailable } from '@/lib/catalog'
import { isMaturity, MATURITIES, MATURITY_LABEL, MATURITY_TONE } from '@/lib/labels'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Plugins e skills' }

interface PluginsProps {
  readonly searchParams: Promise<{ termo?: string; maturidade?: string }>
}

const chip = 'rounded-full border px-3 py-1 text-sm transition-colors hover:bg-muted'
const chipActive = 'border-primary bg-primary-light text-primary hover:bg-primary-light'

export default async function PluginsPage({ searchParams }: PluginsProps) {
  const { termo, maturidade } = await searchParams
  const maturity = isMaturity(maturidade) ? maturidade : undefined
  const all = await whenAvailable(api.plugins(termo ? { term: termo } : {}))

  const href = (value?: PluginMaturity) => {
    const params = new URLSearchParams()
    if (termo) params.set('termo', termo)
    if (value) params.set('maturidade', value)
    const text = params.toString()
    return text ? `/catalogo/plugins?${text}` : '/catalogo/plugins'
  }

  const header = (
    <PageHeader
      title="Plugins e skills"
      description="O que o marketplace do time oferece para o Claude Code, quem cuida de cada plugin e em que ponto ele está."
    />
  )
  if (!all) {
    return (
      <>
        {header}
        <CatalogUnavailable />
      </>
    )
  }

  const plugins = maturity ? all.filter((plugin) => plugin.maturity === maturity) : all
  const count = (value: PluginMaturity) => all.filter((plugin) => plugin.maturity === value).length

  return (
    <>
      {header}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Filtrar por maturidade" className="flex flex-wrap gap-2">
          <Link
            href={href()}
            aria-current={maturity ? undefined : 'page'}
            className={cn(chip, !maturity && chipActive)}
          >
            Todos <span className="text-muted-foreground tabular-nums">{all.length}</span>
          </Link>
          {MATURITIES.map((value) => (
            <Link
              key={value}
              href={href(value)}
              aria-current={maturity === value ? 'page' : undefined}
              className={cn(chip, maturity === value && chipActive)}
            >
              {MATURITY_LABEL[value]}{' '}
              <span className="text-muted-foreground tabular-nums">{count(value)}</span>
            </Link>
          ))}
        </nav>
        <form action="/catalogo/plugins" className="flex w-full gap-2 lg:w-80" role="search">
          {maturity ? <input type="hidden" name="maturidade" value={maturity} /> : null}
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              name="termo"
              defaultValue={termo}
              placeholder="Plugin, skill ou palavra-chave"
              aria-label="Buscar plugins"
              className="pl-8"
            />
          </div>
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
        </form>
      </div>

      {plugins.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {plugins.map((plugin) => (
            <Link key={plugin.name} href={`/catalogo/plugins/${plugin.name}`} className="group">
              <Card className="h-full gap-4 transition-colors group-hover:border-primary/60">
                <CardHeader>
                  <CardTitle className="line-clamp-1 text-base">{plugin.displayName}</CardTitle>
                  <CardAction>
                    <ToneBadge tone={MATURITY_TONE[plugin.maturity]}>
                      {MATURITY_LABEL[plugin.maturity]}
                    </ToneBadge>
                  </CardAction>
                  <p className="font-mono text-xs text-muted-foreground">{plugin.name}</p>
                  <CardDescription className="col-span-full line-clamp-3 pt-1">
                    {plugin.description}
                  </CardDescription>
                </CardHeader>
                <CardFooter className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {plugin.version ? <span className="tabular-nums">v{plugin.version}</span> : null}
                  <span className="flex items-center gap-1">
                    <UserRound className="size-3.5" aria-hidden />
                    {plugin.owner ?? 'Sem dono'}
                  </span>
                  <span className="flex items-center gap-1 tabular-nums">
                    <Puzzle className="size-3.5" aria-hidden />
                    {plugin.skillCount} {plugin.skillCount === 1 ? 'skill' : 'skills'}
                  </span>
                </CardFooter>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Puzzle}
          title="Nenhum plugin com esses filtros"
          description="Tente outra palavra ou remova o filtro de maturidade."
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/catalogo/plugins">Limpar filtros</Link>
            </Button>
          }
        />
      )}
    </>
  )
}
