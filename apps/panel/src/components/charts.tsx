import type { ReviewerLoad, TeamMetrics, WeeklyPoint } from '@lab/eng-metrics/contract'
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { formatWeek } from '@/lib/format'
import { SIGNAL_LABEL } from '@/lib/labels'

const weekly = (trend: WeeklyPoint[]) =>
  trend.map((point) => ({
    week: formatWeek(point.weekStart),
    merged: point.merged,
    hours:
      point.medianHoursToFirstReview === null
        ? null
        : Math.round(point.medianHoursToFirstReview * 10) / 10,
  }))

const deliveryConfig = {
  merged: { label: 'PRs mergeados', color: 'var(--chart-1)' },
} satisfies ChartConfig

export const DeliveryChart = ({ trend }: { readonly trend: WeeklyPoint[] }) => (
  <ChartContainer config={deliveryConfig} className="h-56 w-full">
    <BarChart accessibilityLayer data={weekly(trend)} margin={{ left: -20, right: 8 }}>
      <CartesianGrid vertical={false} />
      <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} />
      <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
      <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
      <Bar dataKey="merged" fill="var(--color-merged)" radius={6} />
    </BarChart>
  </ChartContainer>
)

const firstReviewConfig = {
  hours: { label: 'Horas até a 1ª review', color: 'var(--chart-2)' },
} satisfies ChartConfig

export const FirstReviewChart = ({ trend }: { readonly trend: WeeklyPoint[] }) => (
  <ChartContainer config={firstReviewConfig} className="h-56 w-full">
    <LineChart accessibilityLayer data={weekly(trend)} margin={{ left: -20, right: 8 }}>
      <CartesianGrid vertical={false} />
      <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} />
      <YAxis tickLine={false} axisLine={false} width={40} />
      <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
      <Line
        dataKey="hours"
        type="monotone"
        stroke="var(--color-hours)"
        strokeWidth={2}
        dot={{ r: 3 }}
        connectNulls
      />
    </LineChart>
  </ChartContainer>
)

const signalsConfig = {
  pronto: { label: SIGNAL_LABEL.pronto, color: 'var(--success)' },
  gate: { label: SIGNAL_LABEL.gate, color: 'var(--warning)' },
  ajustes: { label: SIGNAL_LABEL.ajustes, color: 'var(--destructive)' },
  sem_comentario: { label: 'Sem comentário', color: 'var(--muted-foreground)' },
} satisfies ChartConfig

export const SignalsChart = ({ signals }: { readonly signals: TeamMetrics['signals'] }) => {
  const data = (Object.keys(signalsConfig) as (keyof typeof signalsConfig)[]).map((key) => ({
    key,
    label: signalsConfig[key].label,
    total: signals[key],
    fill: `var(--color-${key})`,
  }))
  return (
    <ChartContainer config={signalsConfig} className="h-56 w-full">
      <BarChart accessibilityLayer data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis dataKey="label" type="category" tickLine={false} axisLine={false} width={110} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel nameKey="key" />} />
        <Bar dataKey="total" radius={6} />
      </BarChart>
    </ChartContainer>
  )
}

const loadConfig = {
  reviews: { label: 'Reviews', color: 'var(--chart-1)' },
  comments: { label: 'Comentários', color: 'var(--chart-4)' },
} satisfies ChartConfig

export const ReviewerLoadChart = ({ reviewers }: { readonly reviewers: ReviewerLoad[] }) => (
  <ChartContainer config={loadConfig} className="h-72 w-full">
    <BarChart accessibilityLayer data={reviewers} margin={{ left: -20, right: 8 }}>
      <CartesianGrid vertical={false} />
      <XAxis dataKey="reviewer" tickLine={false} axisLine={false} tickMargin={8} />
      <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} />
      <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
      <Bar dataKey="reviews" fill="var(--color-reviews)" radius={6} />
      <Bar dataKey="comments" fill="var(--color-comments)" radius={6} />
    </BarChart>
  </ChartContainer>
)
