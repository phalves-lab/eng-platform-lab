'use client'

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import type { ThroughputDatum } from '@/lib/flow'

const config = {
  delivered: { label: 'Entregas', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig

export function ThroughputChart({ data }: { readonly data: ThroughputDatum[] }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <BarChart accessibilityLayer data={data} margin={{ left: -12, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} minTickGap={12} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent labelFormatter={(week) => `Semana de ${String(week)}`} />}
        />
        <Bar dataKey="delivered" fill="var(--color-delivered)" radius={6} />
      </BarChart>
    </ChartContainer>
  )
}
