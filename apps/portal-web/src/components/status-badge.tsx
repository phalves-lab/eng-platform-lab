import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import type { BadgeTone } from '@/lib/labels'

export function ToneBadge({
  tone,
  children,
}: {
  readonly tone: BadgeTone
  readonly children: ReactNode
}) {
  return <Badge variant={tone}>{children}</Badge>
}
