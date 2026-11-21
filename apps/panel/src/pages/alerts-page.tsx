import type { AlertSeverity, PanelDataset } from '@lab/eng-metrics/contract'
import { CircleCheckBig } from 'lucide-react'
import { useMemo, useState } from 'react'
import { AlertItem } from '@/components/alert-item'
import { EmptyState } from '@/components/empty-state'
import { navItem } from '@/components/navigation'
import { PageHeader } from '@/components/page-header'
import { ToneBadge } from '@/components/status-badges'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { countBySeverity, groupAlerts } from '@/lib/alerts'

type SeverityFilter = AlertSeverity | 'todas'

const isSeverityFilter = (value: string): value is SeverityFilter =>
  value === 'todas' || value === 'alta' || value === 'media'

export const AlertsPage = ({ dataset }: { readonly dataset: PanelDataset }) => {
  const [severity, setSeverity] = useState<SeverityFilter>('todas')
  const counts = countBySeverity(dataset.alerts)
  const groups = useMemo(
    () =>
      groupAlerts(
        severity === 'todas'
          ? dataset.alerts
          : dataset.alerts.filter((alert) => alert.severity === severity),
      ),
    [dataset.alerts, severity],
  )
  const page = navItem('alertas')

  return (
    <div className="space-y-6">
      <PageHeader
        title={page.title}
        description={page.description}
        actions={
          dataset.alerts.length ? (
            <ToggleGroup
              type="single"
              variant="outline"
              value={severity}
              onValueChange={(value) => {
                if (isSeverityFilter(value)) setSeverity(value)
              }}
              aria-label="Filtrar por severidade"
            >
              <ToggleGroupItem value="todas" className="px-3">
                Todas ({dataset.alerts.length})
              </ToggleGroupItem>
              <ToggleGroupItem value="alta" className="px-3">
                Alta ({counts.alta})
              </ToggleGroupItem>
              <ToggleGroupItem value="media" className="px-3">
                Média ({counts.media})
              </ToggleGroupItem>
            </ToggleGroup>
          ) : null
        }
      />

      {groups.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map((group) => (
            <Card key={group.kind}>
              <CardHeader>
                <CardTitle>{group.kind}</CardTitle>
                <CardAction>
                  <ToneBadge tone={group.severity === 'alta' ? 'destructive' : 'warning'}>
                    {group.alerts.length} {group.severity === 'alta' ? 'alta' : 'média'}
                  </ToneBadge>
                </CardAction>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {group.alerts.map((alert) => (
                    <AlertItem key={`${alert.kind}-${alert.subject}`} alert={alert} />
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={CircleCheckBig}
          title="Nada pedindo atenção"
          description={
            dataset.alerts.length
              ? 'Nenhum alerta com essa severidade.'
              : 'Nenhum alerta neste momento.'
          }
        />
      )}
    </div>
  )
}
