import type { DeliveryAlert } from '@lab/contracts'
import { ArrowUpRight } from 'lucide-react'
import { ToneBadge } from '@/components/status-badge'

export function AlertList({ alerts }: { readonly alerts: DeliveryAlert[] }) {
  return (
    <ul className="divide-y">
      {alerts.map((alert) => (
        <li
          key={`${alert.kind}-${alert.subject}`}
          className="flex flex-col items-start gap-2 py-3 sm:flex-row sm:items-center sm:gap-3"
        >
          <ToneBadge tone={alert.severity === 'alta' ? 'danger' : 'warning'}>
            {alert.kind}
          </ToneBadge>
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-medium">{alert.subject}</span>{' '}
            <span className="text-muted-foreground">{alert.message}</span>
          </p>
          {alert.url ? (
            <a
              href={alert.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Abrir
              <ArrowUpRight className="size-3.5" aria-hidden />
              <span className="sr-only">{alert.subject}</span>
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
