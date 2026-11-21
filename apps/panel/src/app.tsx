import type { PanelDataset } from '@lab/eng-metrics/contract'
import { CloudOff, DatabaseZap } from 'lucide-react'
import { type ComponentType, lazy, type ReactElement, Suspense } from 'react'
import { AppSidebar } from '@/components/app-sidebar'
import { EmptyState } from '@/components/empty-state'
import { navItem } from '@/components/navigation'
import { SiteHeader } from '@/components/site-header'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Skeleton } from '@/components/ui/skeleton'
import { useHashState } from '@/hooks/use-hash-state'
import { useNow } from '@/hooks/use-now'
import { usePanelData } from '@/hooks/use-panel-data'
import { useTheme } from '@/hooks/use-theme'
import type { RouteId } from '@/lib/routes'

type PageComponent = ComponentType<{ readonly dataset: PanelDataset }>

const PAGES: Record<RouteId, PageComponent> = {
  'visao-geral': lazy(() =>
    import('@/pages/overview-page').then((m) => ({ default: m.OverviewPage })),
  ),
  fila: lazy(() => import('@/pages/queue-page').then((m) => ({ default: m.QueuePage }))),
  alertas: lazy(() => import('@/pages/alerts-page').then((m) => ({ default: m.AlertsPage }))),
  metricas: lazy(() => import('@/pages/metrics-page').then((m) => ({ default: m.MetricsPage }))),
  reviews: lazy(() => import('@/pages/reviews-page').then((m) => ({ default: m.ReviewsPage }))),
}

const PageSkeleton = () => (
  <div className="space-y-6" aria-busy="true">
    <Skeleton className="h-8 w-64" />
    <Skeleton className="h-72" />
  </div>
)

const LoadingState = () => (
  <div className="flex min-h-svh" aria-busy="true" aria-label="Carregando o painel">
    <Skeleton className="hidden w-64 rounded-none md:block" />
    <div className="flex-1 space-y-6 p-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  </div>
)

const FullPageMessage = ({ children }: { readonly children: ReactElement }) => (
  <div className="flex min-h-svh items-center justify-center p-6">
    <div className="w-full max-w-lg">{children}</div>
  </div>
)

export const App = () => {
  const state = usePanelData()
  const { route, dataset: datasetId } = useHashState()
  const { theme, toggleTheme } = useTheme()
  const now = useNow()

  if (state.status === 'loading') return <LoadingState />
  if (state.status === 'error')
    return (
      <FullPageMessage>
        <EmptyState icon={CloudOff} title="Painel indisponível" description={state.message} />
      </FullPageMessage>
    )

  const { datasets } = state.data
  const dataset = datasets.find((item) => item.id === datasetId) ?? datasets[0]
  if (!dataset)
    return (
      <FullPageMessage>
        <EmptyState
          icon={DatabaseZap}
          title="Sem dados ainda"
          description="O coletor ainda não publicou nenhum conjunto de dados."
        />
      </FullPageMessage>
    )

  const Page = PAGES[route]

  return (
    <SidebarProvider>
      <AppSidebar
        datasets={datasets}
        current={dataset}
        route={route}
        now={now}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <SidebarInset>
        <SiteHeader
          datasetTitle={dataset.title}
          pageTitle={navItem(route).title}
          generatedAt={dataset.generatedAt}
        />
        <main className="flex-1 p-4 md:p-6">
          <div className="mx-auto w-full max-w-7xl">
            <Suspense fallback={<PageSkeleton />}>
              <Page key={dataset.id} dataset={dataset} />
            </Suspense>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
