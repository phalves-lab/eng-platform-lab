import type { Alert, AlertSeverity } from '@lab/eng-metrics/contract'

export interface AlertGroup {
  kind: string
  severity: AlertSeverity
  alerts: Alert[]
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { alta: 0, media: 1 }

/** Agrupa por tipo, com os grupos de severidade alta primeiro e, dentro dela, os maiores. */
export const groupAlerts = (alerts: Alert[]): AlertGroup[] => {
  const groups = new Map<string, AlertGroup>()
  for (const alert of alerts) {
    const group = groups.get(alert.kind) ?? {
      kind: alert.kind,
      severity: alert.severity,
      alerts: [],
    }
    group.alerts.push(alert)
    if (SEVERITY_ORDER[alert.severity] < SEVERITY_ORDER[group.severity])
      group.severity = alert.severity
    groups.set(alert.kind, group)
  }
  return [...groups.values()].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.alerts.length - a.alerts.length,
  )
}

export const countBySeverity = (alerts: Alert[]) => ({
  alta: alerts.filter((alert) => alert.severity === 'alta').length,
  media: alerts.filter((alert) => alert.severity === 'media').length,
})
