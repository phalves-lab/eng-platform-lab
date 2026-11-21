import type { DoraIncident } from '@lab/contracts'
import { ToneBadge } from '@/components/status-badge'
import { formatDuration, SEVERITY_TONE, shortSha } from '@/lib/dora'
import { formatDateTime } from '@/lib/labels'

export function DoraIncidentList({ incidents }: { readonly incidents: DoraIncident[] }) {
  return (
    <ul className="divide-y">
      {incidents.map((incident) => (
        <li key={incident.id} className="flex flex-col gap-1.5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <ToneBadge tone={SEVERITY_TONE[incident.severity]}>
              {incident.severity.toUpperCase()}
            </ToneBadge>
            <span className="font-mono text-xs text-muted-foreground">{incident.id}</span>
            {incident.endedAt === null ? <ToneBadge tone="warning">Em aberto</ToneBadge> : null}
          </div>
          <p className="text-sm font-medium">{incident.title ?? incident.system}</p>
          <p className="text-xs text-muted-foreground">
            Início em {formatDateTime(incident.startedAt)}
            {incident.endedAt === null
              ? ''
              : ` · restaurado em ${formatDuration(incident.restoreHours)}`}
            {incident.cause
              ? ` · causado pelo deploy ${shortSha(incident.cause.sha)} de ${incident.cause.repo}`
              : ` · sistema ${incident.system}`}
          </p>
        </li>
      ))}
    </ul>
  )
}
