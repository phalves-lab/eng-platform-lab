import { Skeleton } from '@/components/ui/skeleton'

export default function QualityLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Carregando dados de qualidade">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-32" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </div>
  )
}
