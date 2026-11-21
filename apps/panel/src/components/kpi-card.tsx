import type { LucideIcon } from 'lucide-react'
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { Tone } from '@/lib/labels'
import { cn } from '@/lib/utils'

const TONE_TEXT: Record<Tone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
  secondary: 'text-foreground',
}

interface KpiCardProps {
  readonly label: string
  readonly value: string
  readonly icon: LucideIcon
  readonly hint?: string
  readonly tone?: Tone
}

export const KpiCard = ({ label, value, icon: Icon, hint, tone = 'secondary' }: KpiCardProps) => (
  <Card className="gap-2">
    <CardHeader>
      <CardDescription>{label}</CardDescription>
      <CardAction>
        <Icon className="size-4 text-muted-foreground" aria-hidden />
      </CardAction>
      <CardTitle className={cn('text-2xl font-semibold tabular-nums', TONE_TEXT[tone])}>
        {value}
      </CardTitle>
    </CardHeader>
    {hint ? <CardFooter className="text-xs text-muted-foreground">{hint}</CardFooter> : null}
  </Card>
)
