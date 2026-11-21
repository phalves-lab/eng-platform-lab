import Link from 'next/link'
import { cn } from '@/lib/utils'

interface DatasetSwitchProps {
  readonly basePath: string
  readonly current: string
  readonly datasets: { id: string; title: string }[]
}

export function DatasetSwitch({ basePath, current, datasets }: DatasetSwitchProps) {
  return (
    <nav aria-label="Conjunto de dados" className="inline-flex rounded-lg border bg-card p-1">
      {datasets.map((dataset) => (
        <Link
          key={dataset.id}
          href={`${basePath}?conjunto=${dataset.id}`}
          aria-current={dataset.id === current ? 'page' : undefined}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
            dataset.id === current &&
              'bg-primary text-primary-foreground hover:text-primary-foreground',
          )}
        >
          {dataset.title}
        </Link>
      ))}
    </nav>
  )
}
