import { ArrowUpRight } from 'lucide-react'
import type { QueueRow } from '@/lib/api'

export function PrLink({ row }: { readonly row: QueueRow }) {
  return (
    <a
      href={row.url}
      target="_blank"
      rel="noreferrer"
      className="group inline-flex min-w-0 items-start gap-1 text-sm font-medium hover:text-primary"
    >
      <span className="shrink-0 text-muted-foreground">#{row.number}</span>
      <span className="line-clamp-2">{row.title}</span>
      <ArrowUpRight
        className="mt-0.5 size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden
      />
    </a>
  )
}
