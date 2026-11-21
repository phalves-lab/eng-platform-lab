import { Skeleton } from '@/components/ui/skeleton'

export default function DeliveryBoardsLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Carregando board">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>
      <Skeleton className="h-96" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
      <Skeleton className="h-64" />
    </div>
  )
}
