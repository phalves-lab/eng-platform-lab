import type { ProjectPullRequest } from '@lab/contracts'
import { ArrowUpRight } from 'lucide-react'
import { repoShortName } from '@/lib/dora'
import { formatDateTime } from '@/lib/labels'

export function PullRequestList({ items }: { readonly items: ProjectPullRequest[] }) {
  return (
    <ul className="divide-y">
      {items.map((pr) => {
        const meta = [
          pr.repo ? `${repoShortName(pr.repo)} #${pr.number}` : `#${pr.number}`,
          pr.author,
          pr.taskKey,
          `${pr.state === 'open' ? 'aberto em' : 'mergeado em'} ${formatDateTime(pr.at)}`,
        ].filter(Boolean)
        const title = <span className="line-clamp-2 min-w-0 flex-1">{pr.title}</span>
        return (
          <li key={`${pr.state}-${pr.repo}-${pr.number}`} className="space-y-1 py-3">
            {pr.url ? (
              <a
                href={pr.url}
                target="_blank"
                rel="noreferrer"
                className="group flex min-w-0 items-start gap-2 text-sm font-medium hover:text-primary"
              >
                {title}
                <ArrowUpRight
                  className="mt-0.5 size-3.5 shrink-0 opacity-60 group-hover:opacity-100"
                  aria-hidden
                />
                <span className="sr-only">(abre o PR)</span>
              </a>
            ) : (
              <p className="flex min-w-0 text-sm font-medium">{title}</p>
            )}
            <p className="text-xs break-words text-muted-foreground">{meta.join(' · ')}</p>
          </li>
        )
      })}
    </ul>
  )
}
