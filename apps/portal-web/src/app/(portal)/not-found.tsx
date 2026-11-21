import { SearchX } from 'lucide-react'
import Link from 'next/link'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <EmptyState
      icon={SearchX}
      title="Não encontramos isso"
      description="O item pode ter mudado de nome. Use a busca (Ctrl K) para procurar."
      action={
        <Button asChild variant="outline" size="sm">
          <Link href="/">Voltar para Minha página</Link>
        </Button>
      }
    />
  )
}
