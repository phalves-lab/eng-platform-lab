'use client'

import { CloudOff } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'

export default function QualityError({ reset }: { readonly reset: () => void }) {
  return (
    <EmptyState
      icon={CloudOff}
      title="Não foi possível carregar os dados de qualidade"
      description="A API do portal não respondeu ou devolveu dados fora do contrato. Tente de novo em instantes."
      action={
        <Button variant="outline" size="sm" onClick={reset}>
          Tentar de novo
        </Button>
      }
    />
  )
}
