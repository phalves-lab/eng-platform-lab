import type { WorkAlert } from '@lab/contracts'
import { ArrowUpRight } from 'lucide-react'
import { ToneBadge } from '@/components/status-badge'
import { ALERT_LABEL, ALERT_TONE } from '@/lib/work'

export function AlertList({ alerts }: { readonly alerts: WorkAlert[] }) {
  return (
    <ul className="divide-y">
      {alerts.map((alert, index) => (
        <li
          key={`${alert.kind}-${index}`}
          className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-start sm:justify-between"
        >
          {alert.url ? (
            <a
              href={alert.url}
              target="_blank"
              rel="noreferrer"
              className="group inline-flex min-w-0 items-start gap-1 text-sm hover:text-primary"
            >
              <span>{alert.message}</span>
              <ArrowUpRight
                className="mt-0.5 size-3.5 shrink-0 opacity-60 group-hover:opacity-100"
                aria-hidden
              />
            </a>
          ) : (
            <p className="text-sm">{alert.message}</p>
          )}
          <ToneBadge tone={ALERT_TONE[alert.severity]}>{ALERT_LABEL[alert.kind]}</ToneBadge>
        </li>
      ))}
    </ul>
  )
}
