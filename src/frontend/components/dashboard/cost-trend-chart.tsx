"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, type ChartConfig } from "@/components/ui/chart";

const chartConfig = {
  infrastructureCostUsd: { label: "Infrastructure", color: "var(--chart-1)" },
  modelInferenceCostUsd: { label: "Model inference", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function CostTrendChart({
  data,
}: {
  data: { day: string; infrastructureCostUsd: number; modelInferenceCostUsd: number }[];
}) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
      <AreaChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={44}
          tick={{ fontSize: 11 }}
          tickFormatter={(value: number) => `$${value}`}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Area
          dataKey="infrastructureCostUsd"
          type="monotone"
          stackId="cost"
          fill="var(--color-infrastructureCostUsd)"
          fillOpacity={0.4}
          stroke="var(--color-infrastructureCostUsd)"
          isAnimationActive={false}
        />
        <Area
          dataKey="modelInferenceCostUsd"
          type="monotone"
          stackId="cost"
          fill="var(--color-modelInferenceCostUsd)"
          fillOpacity={0.4}
          stroke="var(--color-modelInferenceCostUsd)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  );
}
