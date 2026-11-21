import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'

interface EmptyStateProps {
  readonly icon: LucideIcon
  readonly title: string
  readonly description: string
  readonly action?: ReactNode
}

export const EmptyState = ({ icon: Icon, title, description, action }: EmptyStateProps) => (
  <Empty className="border border-dashed">
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <Icon />
      </EmptyMedia>
      <EmptyTitle>{title}</EmptyTitle>
      <EmptyDescription>{description}</EmptyDescription>
    </EmptyHeader>
    {action ? <EmptyContent>{action}</EmptyContent> : null}
  </Empty>
)
