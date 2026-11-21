'use client'

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
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
import { formatTrendValue, type TrendDatum } from '@/lib/delivery'

const trendConfig = {
  merged: { label: 'PRs mergeados', color: 'hsl(var(--chart-1))' },
  hours: { label: 'Mediana até a 1ª review', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig

const SERIES = ['merged', 'hours'] as const

/** Renders every series for the hovered week, so a week without reviews reads as no data. */
function TrendTooltip({ active, payload }: Partial<TooltipContentProps<number, string>>) {
  const week = payload?.[0]?.payload as TrendDatum | undefined
  if (!active || !week) return null
  return (
    <div className="grid min-w-44 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <p className="font-medium">Semana de {week.week}</p>
      {SERIES.map((series) => (
        <div key={series} className="flex items-center gap-2">
          <span
            className="size-2.5 shrink-0 rounded-[2px]"
            style={{ backgroundColor: `var(--color-${series})` }}
            aria-hidden
          />
          <span className="flex-1 text-muted-foreground">{trendConfig[series].label}</span>
          <span className="font-mono font-medium tabular-nums text-foreground">
            {formatTrendValue(series, week[series])}
          </span>
        </div>
      ))}
    </div>
  )
}

export function ReviewTrendChart({ data }: { readonly data: TrendDatum[] }) {
  return (
    <ChartContainer config={trendConfig} className="aspect-auto h-64 w-full">
      <ComposedChart accessibilityLayer data={data} margin={{ left: -12, right: -12, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} minTickGap={12} />
        <YAxis
          yAxisId="merged"
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <YAxis
          yAxisId="hours"
          orientation="right"
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={(value: number) => `${value} h`}
        />
        <ChartTooltip cursor={false} content={<TrendTooltip />} />
        <ChartLegend itemSorter={null} content={<ChartLegendContent />} />
        <Bar yAxisId="merged" dataKey="merged" fill="var(--color-merged)" radius={6} />
        <Line
          yAxisId="hours"
          dataKey="hours"
          type="monotone"
          stroke="var(--color-hours)"
          strokeWidth={2}
          dot={{ r: 3, fill: 'var(--color-hours)' }}
        />
      </ComposedChart>
    </ChartContainer>
  )
}
