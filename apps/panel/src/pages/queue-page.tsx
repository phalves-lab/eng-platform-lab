import type { PanelDataset, QueueLevel } from '@lab/eng-metrics/contract'
import { CircleCheckBig, Search, SearchX } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EmptyState } from '@/components/empty-state'
import { navItem } from '@/components/navigation'
import { PageHeader } from '@/components/page-header'
import { QueueView } from '@/components/queue-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { LEVEL_LABEL, SIGNAL_LABEL } from '@/lib/labels'
import {
  ALL,
  EMPTY_FILTERS,
  filterQueue,
  hasActiveFilters,
  type QueueFilters,
  type QueueSort,
  queueAuthors,
  type SignalFilter,
  sortQueue,
} from '@/lib/queue'

const SORT_OPTIONS: { value: QueueSort; label: string }[] = [
  { value: 'fila', label: 'Ordem da fila' },
  { value: 'tempo', label: 'Mais tempo' },
  { value: 'tamanho', label: 'Maiores' },
]

const SIGNAL_OPTIONS: { value: SignalFilter; label: string }[] = [
  { value: 'pronto', label: SIGNAL_LABEL.pronto },
  { value: 'gate', label: SIGNAL_LABEL.gate },
  { value: 'ajustes', label: SIGNAL_LABEL.ajustes },
  { value: 'sem_comentario', label: 'Sem comentário' },
]

const isSort = (value: string): value is QueueSort =>
  SORT_OPTIONS.some((option) => option.value === value)

export const QueuePage = ({ dataset }: { readonly dataset: PanelDataset }) => {
  const [filters, setFilters] = useState<QueueFilters>(EMPTY_FILTERS)
  const [sort, setSort] = useState<QueueSort>('fila')
  const authors = useMemo(() => queueAuthors(dataset.queue), [dataset.queue])
  const rows = useMemo(
    () => sortQueue(filterQueue(dataset.queue, filters), sort),
    [dataset.queue, filters, sort],
  )
  const page = navItem('fila')
  const update = (next: Partial<QueueFilters>) => setFilters((current) => ({ ...current, ...next }))

  if (!dataset.queue.length)
    return (
      <div className="space-y-6">
        <PageHeader title={page.title} description={page.description} />
        <EmptyState
          icon={CircleCheckBig}
          title="Fila vazia"
          description="Nenhum PR aberto aguardando review neste conjunto."
        />
      </div>
    )

  return (
    <div className="space-y-6">
      <PageHeader title={page.title} description={page.description} />

      <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative sm:w-64">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={filters.search}
              onChange={(event) => update({ search: event.target.value })}
              placeholder="Buscar PR, task ou pessoa"
              aria-label="Buscar na fila"
              className="pl-8"
            />
          </div>
          <Select
            value={filters.level}
            onValueChange={(level) => update({ level: level as QueueLevel | typeof ALL })}
          >
            <SelectTrigger className="sm:w-40" aria-label="Filtrar por prazo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os prazos</SelectItem>
              {(Object.keys(LEVEL_LABEL) as QueueLevel[]).map((level) => (
                <SelectItem key={level} value={level}>
                  {LEVEL_LABEL[level]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.author} onValueChange={(author) => update({ author })}>
            <SelectTrigger className="sm:w-40" aria-label="Filtrar por autor">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os autores</SelectItem>
              {authors.map((author) => (
                <SelectItem key={author} value={author}>
                  {author}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.signal}
            onValueChange={(signal) => update({ signal: signal as SignalFilter | typeof ALL })}
          >
            <SelectTrigger className="sm:w-44" aria-label="Filtrar por sinal do bot">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os sinais</SelectItem>
              {SIGNAL_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasActiveFilters(filters) ? (
            <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
              Limpar filtros
            </Button>
          ) : null}
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          value={sort}
          onValueChange={(value) => {
            if (isSort(value)) setSort(value)
          }}
          aria-label="Ordenar fila"
          className="self-start"
        >
          {SORT_OPTIONS.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value} className="px-3">
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {rows.length} de {dataset.queue.length} PRs
      </p>

      {rows.length ? (
        <QueueView rows={rows} />
      ) : (
        <EmptyState
          icon={SearchX}
          title="Nenhum PR com esses filtros"
          description="Ajuste a busca ou limpe os filtros para ver a fila inteira."
          action={
            <Button variant="outline" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
              Limpar filtros
            </Button>
          }
        />
      )}
    </div>
  )
}
