'use client'

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { CFD_ORDER, type CfdDatum } from '@/lib/boards'
import { CATEGORY_LABEL } from '@/lib/flow'

const config = {
  done: { label: CATEGORY_LABEL.done, color: 'hsl(var(--success))' },
  review: { label: CATEGORY_LABEL.review, color: 'hsl(var(--info))' },
  blocked: { label: CATEGORY_LABEL.blocked, color: 'hsl(var(--destructive))' },
  in_progress: { label: CATEGORY_LABEL.in_progress, color: 'hsl(var(--chart-1))' },
  todo: { label: CATEGORY_LABEL.todo, color: 'hsl(var(--muted-foreground))' },
} satisfies ChartConfig

export function CfdChart({ data }: { readonly data: CfdDatum[] }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-80 w-full">
      <AreaChart accessibilityLayer data={data} margin={{ left: -12, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <ChartLegend content={<ChartLegendContent className="flex-wrap gap-x-4 gap-y-1" />} />
        {CFD_ORDER.map((category) => (
          <Area
            key={category}
            dataKey={category}
            type="stepAfter"
            stackId="cfd"
            stroke={`var(--color-${category})`}
            fill={`var(--color-${category})`}
            fillOpacity={0.35}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    </ChartContainer>
  )
}
