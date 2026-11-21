'use client'

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import type { SprintDatum } from '@/lib/boards'

const config = {
  planned: { label: 'Previsto no início', color: 'hsl(var(--chart-1))' },
  added: { label: 'Entrou depois', color: 'hsl(var(--warning))' },
  delivered: { label: 'Entregue', color: 'hsl(var(--success))' },
} satisfies ChartConfig

export function SprintChart({ data }: { readonly data: SprintDatum[] }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <BarChart accessibilityLayer data={data} margin={{ left: -12, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="sprint"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval={0}
          tick={{ fontSize: 11 }}
        />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent className="flex-wrap gap-x-4 gap-y-1" />} />
        <Bar dataKey="planned" stackId="scope" fill="var(--color-planned)" />
        <Bar dataKey="added" stackId="scope" fill="var(--color-added)" radius={[6, 6, 0, 0]} />
        <Bar dataKey="delivered" fill="var(--color-delivered)" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}
