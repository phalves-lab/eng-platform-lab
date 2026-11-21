import type { FlowItem } from '@lab/contracts'
import { ArrowUpRight } from 'lucide-react'

/** Key and summary of a Jira item, linking out to the issue when the mirror has its address. */
export function FlowItemLink({
  item,
}: {
  readonly item: Pick<FlowItem, 'key' | 'summary' | 'url'>
}) {
  const label = (
    <>
      <span className="shrink-0 pt-px font-mono text-xs text-muted-foreground">{item.key}</span>
      <span className="line-clamp-2 min-w-0 flex-1">{item.summary ?? 'Sem resumo'}</span>
    </>
  )
  if (!item.url)
    return <span className="flex w-full min-w-0 items-start gap-2 text-sm">{label}</span>
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className="group flex w-full min-w-0 items-start gap-2 text-sm font-medium hover:text-primary"
    >
      {label}
      <ArrowUpRight
        className="mt-0.5 size-3.5 shrink-0 opacity-60 transition-opacity group-hover:opacity-100"
        aria-hidden
      />
      <span className="sr-only">(abre no Jira)</span>
    </a>
  )
}
