import Link from 'next/link'
import type { DoraFilterOption } from '@/lib/dora'
import { cn } from '@/lib/utils'

function FilterGroup({
  label,
  options,
}: {
  readonly label: string
  readonly options: DoraFilterOption[]
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs font-medium text-muted-foreground">{label}</span>
      {options.map((option) => (
        <Link
          key={option.key}
          href={option.href}
          aria-current={option.active ? 'page' : undefined}
          className={cn(
            'rounded-md border bg-card px-2.5 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
            option.active &&
              'border-primary bg-primary text-primary-foreground hover:text-primary-foreground',
          )}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  )
}

export function DoraFilter({
  teams,
  repos,
}: {
  readonly teams: DoraFilterOption[]
  readonly repos: DoraFilterOption[]
}) {
  return (
    <div className="flex flex-col gap-2">
      <FilterGroup label="Time" options={teams} />
      <FilterGroup label="Repositório" options={repos} />
    </div>
  )
}
