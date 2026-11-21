import type { Alert } from '@lab/eng-metrics/contract'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export const AlertItem = ({ alert }: { readonly alert: Alert }) => (
  <li className="flex items-start gap-3 py-2.5">
    <span
      className={cn(
        'mt-1.5 size-2 shrink-0 rounded-full',
        alert.severity === 'alta' ? 'bg-destructive' : 'bg-warning',
      )}
      aria-label={alert.severity === 'alta' ? 'Severidade alta' : 'Severidade média'}
    />
    <div className="min-w-0 flex-1 text-sm">
      <span className="font-medium">{alert.subject}</span>{' '}
      <span className="text-muted-foreground">{alert.message}</span>
    </div>
    {alert.url ? (
      <a
        href={alert.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-primary hover:underline"
      >
        Abrir
        <ArrowUpRight className="size-3" aria-hidden />
      </a>
    ) : null}
  </li>
)
