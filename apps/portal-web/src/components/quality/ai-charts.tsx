'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts'
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { type CostDatum, type PrecisionDatum, formatUsd } from '@/lib/ai-quality'

const precisionConfig = {
  bot: { label: 'Bot de review', color: 'hsl(var(--chart-1))' },
  chat: { label: 'Chat do portal', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig

const costConfig = {
  bot: { label: 'Bot de review', color: 'hsl(var(--chart-1))' },
  chat: { label: 'Chat do portal', color: 'hsl(var(--chart-2))' },
  'golden-set': { label: 'Golden set', color: 'hsl(var(--chart-3))' },
} satisfies ChartConfig

interface PrecisionChartProps {
  readonly data: PrecisionDatum[]
  readonly thresholds: { bot: number; chat: number }
}

export function AiPrecisionChart({ data, thresholds }: PrecisionChartProps) {
  const lines = [...new Set([thresholds.bot, thresholds.chat])]
  return (
    <ChartContainer config={precisionConfig} className="aspect-auto h-64 w-full">
      <LineChart accessibilityLayer data={data} margin={{ left: -4, right: 8, top: 12 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={12} />
        <YAxis
          domain={[0, 100]}
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={(value: number) => `${value}%`}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              formatter={(value, name) =>
                `${precisionConfig[name as keyof typeof precisionConfig]?.label ?? name}: ${value}%`
              }
            />
          }
        />
        <ChartLegend itemSorter={null} content={<ChartLegendContent />} />
        {lines.map((line) => (
          <ReferenceLine
            key={line}
            y={Math.round(line * 100)}
            stroke="hsl(var(--chart-5))"
            strokeDasharray="4 4"
          />
        ))}
        <Line
          dataKey="bot"
          type="monotone"
          stroke="var(--color-bot)"
          strokeWidth={2}
          dot={{ r: 3, fill: 'var(--color-bot)' }}
          connectNulls
        />
        <Line
          dataKey="chat"
          type="monotone"
          stroke="var(--color-chat)"
          strokeWidth={2}
          dot={{ r: 3, fill: 'var(--color-chat)' }}
          connectNulls
        />
      </LineChart>
    </ChartContainer>
  )
}

export function AiCostChart({ data }: { readonly data: CostDatum[] }) {
  return (
    <ChartContainer config={costConfig} className="aspect-auto h-64 w-full">
      <BarChart accessibilityLayer data={data} margin={{ left: 4, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} minTickGap={12} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={80}
          tickFormatter={(value: number) => formatUsd(value)}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              formatter={(value, name) =>
                `${costConfig[name as keyof typeof costConfig]?.label ?? name}: ${formatUsd(Number(value))}`
              }
            />
          }
        />
        <ChartLegend itemSorter={null} content={<ChartLegendContent />} />
        <Bar dataKey="bot" stackId="cost" fill="var(--color-bot)" />
        <Bar dataKey="chat" stackId="cost" fill="var(--color-chat)" />
        <Bar
          dataKey="golden-set"
          stackId="cost"
          fill="var(--color-golden-set)"
          radius={[6, 6, 0, 0]}
        />
      </BarChart>
    </ChartContainer>
  )
}
