import type { AuthorPairs } from '@/lib/delivery'

export function ReviewPairs({ authors }: { readonly authors: AuthorPairs[] }) {
  return (
    <ul className="divide-y">
      {authors.map((entry) => (
        <li key={entry.author} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
          <div className="shrink-0 sm:w-36">
            <p className="text-sm font-medium">{entry.author}</p>
            <p className="text-xs text-muted-foreground">
              {entry.total} {entry.total === 1 ? 'review recebida' : 'reviews recebidas'}
            </p>
          </div>
          <ul className="flex flex-wrap gap-1.5" aria-label={`Quem revisou ${entry.author}`}>
            {entry.reviewers.map((pair) => (
              <li
                key={pair.reviewer}
                className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-0.5 text-xs"
              >
                <span>{pair.reviewer}</span>
                <span className="tabular-nums text-muted-foreground">{pair.count}</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}
