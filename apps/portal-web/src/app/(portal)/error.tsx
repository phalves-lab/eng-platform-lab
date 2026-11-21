'use client'

import { CloudOff } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'

export default function PortalError({ reset }: { readonly reset: () => void }) {
  return (
    <EmptyState
      icon={CloudOff}
      title="Não foi possível carregar esta página"
      description="A API do portal não respondeu. Tente de novo em instantes."
      action={
        <Button variant="outline" size="sm" onClick={reset}>
          Tentar de novo
        </Button>
      }
    />
  )
}
