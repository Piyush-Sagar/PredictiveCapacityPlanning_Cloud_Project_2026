"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ForecastSeries } from "@/lib/types";
import { formatTime } from "@/lib/utils";

const chartConfig = {
  p90: { label: "P90 upper bound", color: "var(--chart-1)" },
  p50: { label: "P50 forecast", color: "var(--chart-2)" },
  actual: { label: "Actual", color: "var(--chart-3)" },
} satisfies ChartConfig;

export function ForecastChart({ series }: { series: ForecastSeries }) {
  const nowLabel = formatTime(series.points[series.nowIndex].timestamp);

  const data = series.points.map((point) => ({
    label: formatTime(point.timestamp),
    p90: point.p90,
    p50: point.p50,
    actual: point.actual ?? null,
  }));

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-72 w-full">
      <ComposedChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          minTickGap={40}
          tick={{ fontSize: 11 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={40}
          tick={{ fontSize: 11 }}
          tickFormatter={(value: number) => `${value}k`}
        />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <ReferenceLine
          x={nowLabel}
          stroke="var(--muted-foreground)"
          strokeDasharray="4 4"
          label={{ value: "Now", position: "insideTopRight", fontSize: 11, fill: "var(--muted-foreground)" }}
        />
        <Area
          dataKey="p90"
          type="monotone"
          fill="var(--color-p90)"
          fillOpacity={0.15}
          stroke="var(--color-p90)"
          strokeOpacity={0.5}
          strokeWidth={1}
          isAnimationActive={false}
        />
        <Line
          dataKey="p50"
          type="monotone"
          stroke="var(--color-p50)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          dataKey="actual"
          type="monotone"
          stroke="var(--color-actual)"
          strokeWidth={2}
          dot={false}
          connectNulls={false}
          isAnimationActive={false}
        />
        <ChartLegend content={<ChartLegendContent />} />
      </ComposedChart>
    </ChartContainer>
  );
}
