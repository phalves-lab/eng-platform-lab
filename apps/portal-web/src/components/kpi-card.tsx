import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

const TONE_TEXT = {
  default: 'text-foreground',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
  muted: 'text-muted-foreground',
} as const

interface KpiCardProps {
  readonly label: string
  readonly value: string | number
  readonly hint?: string
  readonly icon: LucideIcon
  readonly tone?: keyof typeof TONE_TEXT
  readonly badge?: ReactNode
}

export function KpiCard({ label, value, hint, icon: Icon, tone = 'default', badge }: KpiCardProps) {
  return (
    <Card className="@container/card bg-gradient-to-t from-primary/5 to-card shadow-xs dark:bg-card">
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          <Icon className="size-4 text-primary" aria-hidden />
          {label}
        </CardDescription>
        <CardTitle
          className={cn(
            'text-2xl font-semibold tabular-nums @[250px]/card:text-3xl',
            TONE_TEXT[tone],
          )}
        >
          {value}
        </CardTitle>
        {badge ? <CardAction>{badge}</CardAction> : null}
      </CardHeader>
      {hint ? <CardFooter className="text-sm text-muted-foreground">{hint}</CardFooter> : null}
    </Card>
  )
}
