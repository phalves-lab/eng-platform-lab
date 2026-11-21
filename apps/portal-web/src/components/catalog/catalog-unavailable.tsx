import { CloudOff } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'

export function CatalogUnavailable() {
  return (
    <EmptyState
      icon={CloudOff}
      title="Catálogo indisponível"
      description="A portal-api não conseguiu ler o marketplace ou o overlay em catalog/ai. Confira PORTAL_MARKETPLACE_DIR e os logs da API."
    />
  )
}
