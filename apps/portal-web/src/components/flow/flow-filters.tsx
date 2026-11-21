'use client'

import { LoaderCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { FilterSelect } from '@/components/flow/filter-select'
import { type FlowFilter, flowHref, WEEK_OPTIONS } from '@/lib/flow'
import { cn } from '@/lib/utils'

const ALL = 'todos'

interface FlowFiltersProps {
  readonly basePath: string
  readonly filter: FlowFilter
  readonly projects: string[]
  readonly components: string[]
}

export function FlowFilters({ basePath, filter, projects, components }: FlowFiltersProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const go = (next: FlowFilter) =>
    startTransition(() => router.push(flowHref(basePath, next), { scroll: false }))

  return (
    <div className="grid w-full gap-3 sm:grid-cols-3 lg:max-w-3xl">
      <FilterSelect
        label="Projeto"
        value={filter.project ?? ALL}
        options={[
          { value: ALL, label: 'Todos os projetos' },
          ...projects.map((project) => ({ value: project, label: project })),
        ]}
        onChange={(value) =>
          go({ weeks: filter.weeks, ...(value === ALL ? {} : { project: value }) })
        }
      />
      <FilterSelect
        label="Componente"
        value={filter.component ?? ALL}
        disabled={!filter.project}
        options={[
          { value: ALL, label: 'Todos os componentes' },
          ...components.map((component) => ({ value: component, label: component })),
        ]}
        onChange={(value) =>
          go({
            weeks: filter.weeks,
            ...(filter.project ? { project: filter.project } : {}),
            ...(value === ALL ? {} : { component: value }),
          })
        }
      />
      <FilterSelect
        label="Janela"
        value={String(filter.weeks)}
        options={WEEK_OPTIONS.map((weeks) => ({ value: String(weeks), label: `${weeks} semanas` }))}
        onChange={(value) => go({ ...filter, weeks: Number(value) })}
      />
      <p
        className={cn(
          'flex items-center gap-2 text-xs text-muted-foreground sm:col-span-full',
          !pending && 'sr-only',
        )}
        aria-live="polite"
      >
        {pending ? (
          <>
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
            Atualizando as métricas…
          </>
        ) : (
          'Métricas atualizadas.'
        )}
      </p>
    </div>
  )
}
