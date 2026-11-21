import type { DoraSummary } from '@lab/contracts'
import { DoraBandBadge } from '@/components/delivery/dora-band'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDuration, formatPerWeek, formatRate } from '@/lib/dora'

export interface DoraSummaryRow {
  key: string
  name: string
  detail: string
  summary: DoraSummary
}

function Metric({
  value,
  band,
}: {
  readonly value: string
  readonly band: DoraSummary['leadTime']['band']
}) {
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="tabular-nums">{value}</span>
      <DoraBandBadge band={band} />
    </div>
  )
}

export function DoraSummaryTable({
  label,
  rows,
}: {
  readonly label: string
  readonly rows: DoraSummaryRow[]
}) {
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[640px]">
        <TableHeader>
          <TableRow>
            <TableHead>{label}</TableHead>
            <TableHead>Frequência de deploy</TableHead>
            <TableHead>Lead time</TableHead>
            <TableHead>Taxa de falha</TableHead>
            <TableHead>Restauração</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ key, name, detail, summary }) => (
            <TableRow key={key}>
              <TableCell>
                <p className="font-medium">{name}</p>
                <p className="text-xs text-muted-foreground">{detail}</p>
              </TableCell>
              <TableCell>
                <Metric
                  value={formatPerWeek(summary.deploymentFrequency.perWeek)}
                  band={summary.deploymentFrequency.band}
                />
              </TableCell>
              <TableCell>
                <Metric
                  value={formatDuration(summary.leadTime.medianHours)}
                  band={summary.leadTime.band}
                />
              </TableCell>
              <TableCell>
                <Metric
                  value={formatRate(summary.changeFailureRate.rate)}
                  band={summary.changeFailureRate.band}
                />
              </TableCell>
              <TableCell>
                <Metric
                  value={formatDuration(summary.timeToRestore.medianHours)}
                  band={summary.timeToRestore.band}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
