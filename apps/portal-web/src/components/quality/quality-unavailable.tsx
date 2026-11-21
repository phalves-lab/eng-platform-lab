import { DatabaseZap } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'

export function ScorecardUnavailable() {
  return (
    <EmptyState
      icon={DatabaseZap}
      title="O scorecard ainda não foi gerado"
      description="Rode o coletor do scorecard no worker para gravar o relatório e recarregue a página."
      action={
        <code className="rounded bg-muted px-2 py-1 font-mono text-xs break-all">
          npm run scorecard -w @lab/portal-worker
        </code>
      }
    />
  )
}
