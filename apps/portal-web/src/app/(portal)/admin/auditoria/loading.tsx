import { Skeleton } from '@/components/ui/skeleton'

export default function AuditLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Carregando a auditoria">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <Skeleton className="h-48" />
      <Skeleton className="h-96" />
    </div>
  )
}
