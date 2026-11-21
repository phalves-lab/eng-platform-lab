'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from 'recharts'
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
} from '@/components/ui/chart'
import { type DoraTrendDatum, formatDoraTrendValue } from '@/lib/dora'

const deploysConfig = {
  ok: { label: 'Deploys sem falha', color: 'hsl(var(--chart-1))' },
  failed: { label: 'Deploys com falha', color: 'hsl(var(--chart-5))' },
} satisfies ChartConfig

const durationConfig = {
  lead: { label: 'Lead time (mediana)', color: 'hsl(var(--chart-2))' },
  restore: { label: 'Restauração (mediana)', color: 'hsl(var(--chart-4))' },
} satisfies ChartConfig

type Series = keyof Omit<DoraTrendDatum, 'week'>

/** Lists every series of the hovered week, so a week without data reads as no data. */
function WeekTooltip({
  active,
  payload,
  config,
}: Partial<TooltipContentProps<number, string>> & {
  readonly config: Partial<Record<Series, { label: string }>>
}) {
  const week = payload?.[0]?.payload as DoraTrendDatum | undefined
  if (!active || !week) return null
  const series = Object.keys(config) as Series[]
  return (
    <div className="grid min-w-44 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <p className="font-medium">Semana de {week.week}</p>
      {series.map((key) => (
        <div key={key} className="flex items-center gap-2">
          <span
            className="size-2.5 shrink-0 rounded-[2px]"
            style={{ backgroundColor: `var(--color-${key})` }}
            aria-hidden
          />
          <span className="flex-1 text-muted-foreground">{config[key]?.label}</span>
          <span className="font-mono font-medium tabular-nums text-foreground">
            {formatDoraTrendValue(key, week[key])}
          </span>
        </div>
      ))}
    </div>
  )
}

export function DoraDeploysChart({ data }: { readonly data: DoraTrendDatum[] }) {
  return (
    <ChartContainer config={deploysConfig} className="aspect-auto h-64 w-full">
      <BarChart accessibilityLayer data={data} margin={{ left: -12, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} minTickGap={12} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
        <ChartTooltip cursor={false} content={<WeekTooltip config={deploysConfig} />} />
        <ChartLegend itemSorter={null} content={<ChartLegendContent />} />
        <Bar dataKey="ok" stackId="deploys" fill="var(--color-ok)" />
        <Bar dataKey="failed" stackId="deploys" fill="var(--color-failed)" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}

export function DoraDurationChart({ data }: { readonly data: DoraTrendDatum[] }) {
  return (
    <ChartContainer config={durationConfig} className="aspect-auto h-64 w-full">
      <LineChart accessibilityLayer data={data} margin={{ left: -4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} minTickGap={12} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={48}
          tickFormatter={(value: number) => `${value} h`}
        />
        <ChartTooltip cursor={false} content={<WeekTooltip config={durationConfig} />} />
        <ChartLegend itemSorter={null} content={<ChartLegendContent />} />
        <Line
          dataKey="lead"
          type="monotone"
          stroke="var(--color-lead)"
          strokeWidth={2}
          dot={{ r: 3, fill: 'var(--color-lead)' }}
          connectNulls
        />
        <Line
          dataKey="restore"
          type="monotone"
          stroke="var(--color-restore)"
          strokeWidth={2}
          dot={{ r: 3, fill: 'var(--color-restore)' }}
          connectNulls={false}
        />
      </LineChart>
    </ChartContainer>
  )
}
