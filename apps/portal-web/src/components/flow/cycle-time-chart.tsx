'use client'

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import type { CycleDatum } from '@/lib/flow'

const config = {
  count: { label: 'Itens', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig

export function CycleTimeChart({ data }: { readonly data: CycleDatum[] }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <BarChart accessibilityLayer data={data} margin={{ left: -12, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="tick" tickLine={false} axisLine={false} tickMargin={8} interval={0} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const datum = payload[0]?.payload as CycleDatum | undefined
                return datum?.range ?? ''
              }}
            />
          }
        />
        <Bar dataKey="count" fill="var(--color-count)" radius={6} />
      </BarChart>
    </ChartContainer>
  )
}
