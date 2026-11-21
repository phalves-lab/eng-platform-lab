import type { DoraDeploy } from '@lab/contracts'
import { ArrowUpRight } from 'lucide-react'
import { ToneBadge } from '@/components/status-badge'
import { deployBadge, repoShortName, shortSha } from '@/lib/dora'
import { formatDateTime } from '@/lib/labels'

export function DoraDeployList({ deploys }: { readonly deploys: DoraDeploy[] }) {
  return (
    <ul className="divide-y">
      {deploys.map((deploy) => {
        const badge = deployBadge(deploy)
        return (
          <li
            key={`${deploy.repo}-${deploy.sha}-${deploy.deployedAt}`}
            className="flex items-start justify-between gap-3 py-3"
          >
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <ToneBadge tone={badge.tone}>{badge.label}</ToneBadge>
                <span className="truncate text-sm font-medium" title={deploy.repo}>
                  {repoShortName(deploy.repo)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                <code className="font-mono">{shortSha(deploy.sha)}</code> em{' '}
                {formatDateTime(deploy.deployedAt)}
                {deploy.incidentIds.length ? ` · ${deploy.incidentIds.join(', ')}` : ''}
              </p>
            </div>
            {deploy.url ? (
              <a
                href={deploy.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Execução
                <ArrowUpRight className="size-3.5" aria-hidden />
                <span className="sr-only">do deploy {shortSha(deploy.sha)}</span>
              </a>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
