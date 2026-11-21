'use client'

import type { ReleaseProject, ReleaseSideFilter } from '@lab/contracts'
import { ArrowRight, LoaderCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useId, useTransition } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { selectionQuery, SIDE_LABEL, sideOptions } from '@/lib/releases'
import { cn } from '@/lib/utils'

interface ReleaseFiltersProps {
  readonly projects: ReleaseProject[]
  readonly projectId: string
  readonly side: ReleaseSideFilter
  readonly source: string
  readonly target: string
  readonly branches: string[] | null
}

interface FieldProps {
  readonly label: string
  readonly value: string
  readonly options: { value: string; label: string }[]
  readonly disabled?: boolean
  readonly onChange: (value: string) => void
}

function Field({ label, value, options, disabled, onChange }: FieldProps) {
  const id = useId()
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <Select value={value} onValueChange={onChange} disabled={disabled ?? false}>
        <SelectTrigger id={id} className="w-full min-w-0">
          <SelectValue>
            {options.find((option) => option.value === value)?.label ?? value}
          </SelectValue>
        </SelectTrigger>
        <SelectContent position="popper" className="max-h-72">
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

const branchOptions = (branches: string[] | null, current: string) =>
  [...new Set([current, ...(branches ?? [])])]
    .sort((a, b) => a.localeCompare(b))
    .map((branch) => ({ value: branch, label: branch }))

export function ReleaseFilters({
  projects,
  projectId,
  side,
  source,
  target,
  branches,
}: ReleaseFiltersProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const project = projects.find((item) => item.id === projectId) ?? projects[0]
  if (!project) return null

  const go = (next: {
    project: ReleaseProject
    side: ReleaseSideFilter
    source: string
    target: string
  }) => startTransition(() => router.push(`/releases?${selectionQuery(next)}`, { scroll: false }))

  const changeProject = (id: string) => {
    const next = projects.find((item) => item.id === id)
    if (!next) return
    go({
      project: next,
      side: sideOptions(next).at(-1) ?? 'back',
      source: next.source,
      target: next.target,
    })
  }

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] md:items-end">
      <Field
        label="Projeto"
        value={project.id}
        options={projects.map((item) => ({ value: item.id, label: item.name }))}
        onChange={changeProject}
      />
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground" id="release-side-label">
          Lado
        </span>
        <div
          role="radiogroup"
          aria-labelledby="release-side-label"
          className="inline-flex h-9 w-full rounded-md border bg-card p-0.5 md:w-auto"
        >
          {sideOptions(project).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={option === side}
              onClick={() => go({ project, side: option, source, target })}
              className={cn(
                'flex-1 rounded-[5px] px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                option === side &&
                  'bg-primary text-primary-foreground hover:text-primary-foreground',
              )}
            >
              {SIDE_LABEL[option]}
            </button>
          ))}
        </div>
      </div>
      <Field
        label="Origem"
        value={source}
        options={branchOptions(branches, source)}
        disabled={!branches}
        onChange={(value) => go({ project, side, source: value, target })}
      />
      <ArrowRight
        className="hidden size-4 self-end text-muted-foreground md:mb-2.5 md:block"
        aria-hidden
      />
      <Field
        label="Destino"
        value={target}
        options={branchOptions(branches, target)}
        disabled={!branches}
        onChange={(value) => go({ project, side, source, target: value })}
      />
      <p
        className={cn(
          'flex items-center gap-2 text-xs text-muted-foreground md:col-span-full',
          !pending && 'sr-only',
        )}
        aria-live="polite"
      >
        {pending ? (
          <>
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
            Atualizando a prévia…
          </>
        ) : (
          'Prévia atualizada.'
        )}
      </p>
    </div>
  )
}
